// Disables the command prompt window that would normally pop up on Windows if run as a bundled app
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::borrow::Cow;
use std::{fs, mem};
use std::fmt::Formatter;
use std::future::Future;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{Arc, Mutex, MutexGuard};
use tokio::sync::oneshot;

use itertools::Itertools;
use lazy_static::lazy_static;
use path_dedot::*;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Listener, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, State};
use tauri::menu::{IsMenuItem, Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_fs::FilePath;
use chat_history_manager_backend::prelude::*;
use chat_history_manager_backend::prelude::client::ChatHistoryManagerGrpcClients;

/// Proceed with the result value, or report UI error and return
macro_rules! handle_result {
    ($res:expr, $app_handle:ident) => {
        match $res {
            Ok(v) => v,
            Err(e @ anyhow::Error { .. }) => {
                report_error_string($app_handle.clone(), error_message(&e));
                return;
            }
        }
    };
}

lazy_static! {
    static ref MENU_ID_DATABASE: MenuId = MenuId::from_str("database").unwrap();
    static ref MENU_ID_EDIT: MenuId = MenuId::from_str("edit").unwrap();

    static ref MENU_ID_OPEN: MenuId = MenuId::from_str("open").unwrap();
    static ref MENU_ID_USERS: MenuId = MenuId::from_str("users").unwrap();
    static ref MENU_ID_MERGE_DATASETS: MenuId = MenuId::from_str("merge_datasets").unwrap();
    static ref MENU_ID_COMPARE_DATASETS: MenuId = MenuId::from_str("compare_datasets").unwrap();
}

static MENU_PREFIX_SAVE_AS: &str = "save-as";
static MENU_PREFIX_CLOSE: &str = "close";

struct MenuDbSeparatorIds {
    before: MenuId,
    after: MenuId,
}

pub struct TauriHandlerWrapper {
    pub app_handler: Option<AppHandle>
}

// These constans are duplicated in the JS part of the application
static EVENT_OPEN_FILES_CHANGED: &str = "open-files-changed";
static EVENT_SAVE_AS_CLICKED: &str = "save-as-clicked";
static EVENT_USERS_CLICKED: &str = "users-clicked";
static EVENT_MERGE_DATASETS_CLICKED: &str = "merge-datasets-clicked";
static EVENT_COMPARE_DATASETS_CLICKED: &str = "compare-datasets-clicked";
static EVENT_COMPARE_DATASETS_FINISHED: &str = "compare-datasets-finished";
static EVENT_BUSY: &str = "busy";

static EVENT_CHOOSE_MYSELF: &str = "choose-myself";
static EVENT_CHOOSE_MYSELF_RESPONSE: &str = "choose-myself-response";

static EVENT_ASK_FOR_TEXT: &str = "ask-for-text";
static EVENT_ASK_FOR_TEXT_RESPONSE: &str = "ask-for-text-response";

#[derive(Clone, Debug)]
pub struct TauriUiWrapper {
    state: Arc<Mutex<TauriInnerState>>
}

#[derive(Debug)]
pub enum TauriInnerState {
    None,

    BuildReady(TauriInnerStateBuildReady),

    Running {
        app_handle_rx: oneshot::Receiver<AppHandle>
    },
}

// Made into a separate struct to implement Debug trait.
// Fields are optional so that they can be taken away.
pub struct TauriInnerStateBuildReady {
    builder: Option<tauri::Builder<tauri::Wry>>,
    // To be passed to the next state
    app_handle_rx: Option<oneshot::Receiver<AppHandle>>,
}

impl std::fmt::Debug for TauriInnerStateBuildReady {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TauriInnerStateBuildReady")
            .field("builder", &self.builder.is_some())
            .field("app_handle_rx", &self.app_handle_rx.is_some())
            .finish()
    }
}

// TODO: Icon
pub fn create_ui(clients: ChatHistoryManagerGrpcClients, port: u16) -> TauriUiWrapper {
    let (app_handle_tx, app_handle_rx) = oneshot::channel::<AppHandle>();
    let res = TauriUiWrapper {
        state: Arc::new(Mutex::new(TauriInnerState::None))
    };
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(GrpcPort(port))
        .manage(Arc::clone(&res.state))
        .manage(clients)
        .manage(BusyState::new(Mutex::new(BusyStateValue::NotBusy)))
        .setup(move |app| {
            let app_handle = app.handle();

            let (menu, separator_ids) = create_menu_once(app_handle)?;
            app_handle.set_menu(menu)?;
            assert!(app_handle.manage(separator_ids));

            if app_handle_tx.send(app_handle.clone()).is_err() {
                panic!("Failed to send AppHandle through the oneshot channel");
            }

            let clients = app.state::<ChatHistoryManagerGrpcClients>().inner().clone();

            {
                let clients = clients.clone();
                run_async_callback(
                    app_handle.clone(),
                    move |app_handle| refresh_opened_files_list(app_handle, clients, false),
                );
            }

            app_handle.on_menu_event(move |app_handle, event| {
                let app_handle = app_handle.clone();
                let clients = clients.clone();
                run_async_callback(
                    app_handle,
                    move |app_handle| on_menu_event(event, app_handle, clients),
                );
            });

            // Make window occupy 90% of the screen height, and set the width to keep margin consistent
            let target_height_coeff = 0.9;
            for wv_window in app_handle.webview_windows().values() {
                let monitor = wv_window.current_monitor()?.ok_or(anyhow!("Can't detect current monitor"))?;
                let monitor_size = monitor.size();
                let height_delta = (monitor_size.height as f64 * (1.0 - target_height_coeff)) as u32;
                let target_size = PhysicalSize {
                    width: monitor_size.width - height_delta,
                    height: monitor_size.height - height_delta,
                };
                wv_window.set_size(target_size)?;
                // .center() doesn't work here
                wv_window.set_position(Position::Physical(PhysicalPosition {
                    x: height_delta as i32 / 2,
                    y: height_delta as i32 / 2,
                }))?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_grpc_port, report_error_string, file_exists, read_file_base64, save_as, compare_datasets, merge_datasets
        ]);
    *res.state.lock().expect("Tauri state lock") = TauriInnerState::BuildReady(TauriInnerStateBuildReady {
        builder: Some(builder),
        app_handle_rx: Some(app_handle_rx),
    });
    res
}

impl TauriUiWrapper {
    pub fn start_and_block(&self) {
        let mut guarded_state = self.state.lock().expect("Tauri state lock");

        let TauriInnerState::BuildReady(TauriInnerStateBuildReady { builder, app_handle_rx }) = &mut *guarded_state else {
            panic!("Tauri UI was not build-ready: {:?}", *guarded_state)
        };
        let builder = builder.take().unwrap();
        let app_handle_rx = app_handle_rx.take().unwrap();
        *guarded_state = TauriInnerState::Running { app_handle_rx };
        // Unlocking the mutex
        drop(guarded_state);

        builder
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }

    pub fn listen_for_user_input(&self) -> impl Future<Output = Result<impl FeedbackClientAsync>> + Send {
        let mut guarded_state = self.state.lock().expect("Tauri state lock");
        let mut moved_state = TauriInnerState::None;
        mem::swap(&mut *guarded_state, &mut moved_state);
        drop(guarded_state);

        async move {
            let TauriInnerState::Running { app_handle_rx } = moved_state else {
                return err!("Tauri UI is not running")
            };
            let app_handle = app_handle_rx.await?;
            Ok(TauriFeedbackClientAsync { app_handle })
        }
    }
}

//
// User input requester
//

struct TauriFeedbackClientAsync {
    app_handle: AppHandle,
}

impl FeedbackClientAsync for TauriFeedbackClientAsync {
    async fn choose_myself(&self, users: &[User]) -> Result<usize> {
        self.app_handle.emit(EVENT_CHOOSE_MYSELF, users)?;
        let (selection_tx, selection_rx) = oneshot::channel::<i32>();
        self.app_handle.once(EVENT_CHOOSE_MYSELF_RESPONSE, |ev| {
            let payload = ev.payload();
            selection_tx.send(payload.parse().expect("choose myself payload")).expect("send selection");
        });
        let result = selection_rx.await?;
        Ok(result as usize)
    }

    async fn ask_for_text(&self, prompt: &str) -> Result<String> {
        self.app_handle.emit(EVENT_ASK_FOR_TEXT, prompt.to_owned())?;
        let (selection_tx, selection_rx) = oneshot::channel::<String>();
        self.app_handle.once(EVENT_ASK_FOR_TEXT_RESPONSE, |ev| {
            let input: String = serde_json::from_str(ev.payload()).expect("not a quoted string");
            selection_tx.send(input).expect("send selection");
        });
        let result = selection_rx.await?;
        Ok(result)
    }
}

//
// UI utility functions
//

fn create_menu_once<R, M>(app_handle: &M) -> tauri::Result<(Menu<R>, MenuDbSeparatorIds)>
    where R: Runtime, M: Manager<R>
{
    let pre_db_sep = PredefinedMenuItem::separator(app_handle)?;
    let post_db_sep = PredefinedMenuItem::separator(app_handle)?;

    let separator_ids = MenuDbSeparatorIds {
        before: pre_db_sep.id().clone(),
        after: post_db_sep.id().clone(),
    };

    // First menu will be a main dropdown menu on macOS
    let file_menu = Submenu::with_id_and_items(
        app_handle, MENU_ID_DATABASE.clone(), "Database", true,
        &[
            &MenuItem::with_id(app_handle, MENU_ID_OPEN.clone(), "Open", true, None::<&str>)?,
            &pre_db_sep,
            &post_db_sep,
            &PredefinedMenuItem::quit(app_handle, None)?,
        ])?;

    let edit_menu = Submenu::with_id_and_items(
        app_handle, MENU_ID_EDIT.clone(), "Edit", true,
        &[
            &MenuItem::with_id(app_handle, MENU_ID_USERS.clone(), "Users", true, None::<&str>)?,
            &MenuItem::with_id(app_handle, MENU_ID_MERGE_DATASETS.clone(), "Merge Datasets", true, None::<&str>)?,
            &MenuItem::with_id(app_handle, MENU_ID_COMPARE_DATASETS.clone(), "Compare Datasets", true, None::<&str>)?,
        ])?;

    Ok((Menu::with_items(app_handle, &[&file_menu, &edit_menu])?, separator_ids))
}

async fn on_menu_event(
    event: MenuEvent,
    app_handle: AppHandle,
    mut clients: ChatHistoryManagerGrpcClients,
) -> Result<()> {
    match event.id() {
        menu_id if menu_id == &*MENU_ID_OPEN => {
            on_menu_event_open(app_handle, clients).await?;
        }
        menu_id if menu_id.0.starts_with(MENU_PREFIX_CLOSE) => {
            let key = menu_id.0[(MENU_PREFIX_CLOSE.len() + 1)..].to_owned();
            clients.grpc(|loader, _, _| loader.close(CloseRequest { key })).await?;
            refresh_opened_files_list(app_handle, clients, true).await?;
        }
        menu_id if menu_id.0.starts_with(MENU_PREFIX_SAVE_AS) => {
            let key = menu_id.0[(MENU_PREFIX_SAVE_AS.len() + 1)..].to_owned();
            let storage_path_response =
                clients.grpc(|_, dao, _| dao.storage_path(StoragePathRequest { key: key.clone() })).await?;
            let path = PathBuf::from(storage_path_response.path);
            let old_file_name = path_file_name(&path)?;
            app_handle.emit(EVENT_SAVE_AS_CLICKED, (key, old_file_name, path_to_str(&path)?.to_owned()))?;
        }
        menu_id if menu_id == &*MENU_ID_USERS => {
            app_handle.emit(EVENT_USERS_CLICKED, ())?;
        }
        menu_id if menu_id == &*MENU_ID_MERGE_DATASETS => {
            app_handle.emit(EVENT_MERGE_DATASETS_CLICKED, ())?;
        }
        menu_id if menu_id == &*MENU_ID_COMPARE_DATASETS => {
            app_handle.emit(EVENT_COMPARE_DATASETS_CLICKED, ())?;
        }
        _ => {}
    };
    Ok(())
}

async fn on_menu_event_open(
    app_handle: AppHandle,
    mut clients: ChatHistoryManagerGrpcClients,
) -> Result<()> {
    let busy_state = app_handle.state::<BusyState>().clone();
    // We cannot add custom file filters here, and extension filter is not enough.
    // As a workaround, user can select any file.
    let picked = app_handle
        .dialog()
        .file()
        .set_title("Open one of the supported file types (see README.md)")
        .blocking_pick_file();
    match picked {
        Some(FilePath::Path(picked)) => {
            let _wip = WorkInProgress::start(app_handle.clone(), busy_state.inner().clone(), Cow::Borrowed("Opening..."))?;
            let path = path_to_str(&picked)?.to_owned();
            let key = path.clone();
            let _response = clients.grpc(|loader, _, _| loader.load(LoadRequest { key, path })).await?;
            refresh_opened_files_list(app_handle, clients, true).await?;
        }
        _ => { /* No file picked */ }
    };
    Ok(())
}

async fn refresh_opened_files_list(
    app_handle: AppHandle,
    mut clients: ChatHistoryManagerGrpcClients,
    emit_js_event: bool,
) -> Result<()> {
    let separators = app_handle.state::<MenuDbSeparatorIds>();
    let menu = app_handle.menu().expect("get menu");
    let menu_items = menu.items()?;
    let main_menu = menu_items[0].as_submenu().expect("get submenu");
    let items = main_menu.items()?;
    let (pre_db_sep_idx, post_db_sep_idx) = {
        (items.iter().position(|item| item.id() == &separators.before).expect("find separator 1 position"),
         items.iter().position(|item| item.id() == &separators.after).expect("find separator 2 position"))
    };

    let loaded_files = clients.grpc(|loader, _, _| loader.get_loaded_files(Empty {})).await?;
    let loaded_files = loaded_files.files;

    let new_items: StdResult<Vec<Submenu<_>>, _> = loaded_files.iter()
        .map(|loaded_file| Submenu::with_id_and_items(
            &app_handle, &loaded_file.key, &loaded_file.name, true,
            &[
                &MenuItem::with_id(&app_handle, format!("{MENU_PREFIX_SAVE_AS}_{}", loaded_file.key),
                                   "Save As", true, None::<&str>)?,
                &PredefinedMenuItem::separator(&app_handle)?,
                &MenuItem::with_id(&app_handle, format!("{MENU_PREFIX_CLOSE}_{}", loaded_file.key),
                                   "Close", true, None::<&str>)?,
            ],
        ))
        .collect();
    let new_items = new_items?;

    let new_items = as_dyn_menu_items(&new_items);

    // Note: on macOS and tauri v2.0.0-beta.14 (muda v0.13.1), removing an item from Menu or Submenu causes panic:
    // *** Assertion failure in -[NSMenu dealloc], NSMenu.m:438
    // Because of that we have to use a workaround with replacing the whole menu.

    let main_menu_copy = Submenu::with_id(&app_handle, &main_menu.id().0, main_menu.text()?, true)?;
    main_menu_copy.append_items(&as_dyn_menu_items(&items[..=pre_db_sep_idx]))?;
    main_menu_copy.append_items(&new_items)?;
    main_menu_copy.append_items(&as_dyn_menu_items(&items[post_db_sep_idx..]))?;

    app_handle.set_menu(Menu::with_id_and_items(&app_handle, &menu.id().0, &as_dyn_menu_items(
        &[
            &[main_menu_copy.kind()],
            &menu_items[1..]
        ].concat()
    ))?)?;

    if emit_js_event {
        // Trigger JS refresh
        app_handle.emit(EVENT_OPEN_FILES_CHANGED, ())?;
    }

    Ok(())
}

//
// Commands
//

#[tauri::command]
fn get_grpc_port(app_handle: AppHandle) -> tauri::Result<u16> {
    Ok(app_handle.state::<GrpcPort>().0)
}

#[tauri::command]
fn report_error_string(app_handle: AppHandle, error: String) {
    log::error!("UI reported error: {}", error);
    app_handle.dialog()
        .message(error)
        .title("Error")
        .kind(MessageDialogKind::Error)
        .show(|_res| () /* Ignore the result */);
}

/// Path may contain double dot
#[tauri::command]
fn file_exists(relative_path: String, root: String) -> tauri::Result<bool> {
    let path = Path::new(&root).join(&relative_path);
    let path = path.parse_dot()?;
    let result = fs::exists(path)?;
    Ok(result)
}

#[tauri::command]
fn read_file_base64(relative_path: String, ds_root: String) -> tauri::Result<String> {
    let path = Path::new(&ds_root).join(&relative_path);
    log::info!("Reading file at {}", path.display());
    use base64::prelude::*;
    let bytes = fs::read(path)?;
    let encoded = BASE64_STANDARD.encode(bytes);
    Ok(encoded)
}

#[tauri::command]
fn save_as(
    key: String,
    new_name: String,
    app_handle: AppHandle,
    clients: State<ChatHistoryManagerGrpcClients>,
    busy_state: State<BusyState>,
) -> tauri::Result<()> {
    let mut clients = clients.inner().clone();
    let wip = WorkInProgress::start(app_handle.clone(), busy_state.inner().clone(), Cow::Borrowed("Saving..."))?;
    run_async_callback(app_handle, move |app_handle| {
        async move {
            let _wip = wip; // Move the WIP RAII inside async closure
            clients.grpc(|_, dao, _| dao.save_as(SaveAsRequest { key, new_folder_name: new_name })).await?;
            refresh_opened_files_list(app_handle, clients, true).await
        }
    });
    Ok(())
}

// I didn't find a way to disable 60s timeout on the front-end (at least on Safari webview),
// so we're using backend to make this request.
#[tauri::command]
fn compare_datasets(
    compare_request: Vec<u8>,
    app_handle: AppHandle,
    clients: State<ChatHistoryManagerGrpcClients>,
    busy_state: State<BusyState>,
) -> tauri::Result<()> {
    use prost::Message;
    let compare_request = EnsureSameRequest::decode(compare_request.as_slice()).map_err(|e| tauri::Error::CannotDeserializeScope(Box::new(e)))?;
    let mut clients = clients.inner().clone();
    let wip = WorkInProgress::start(app_handle.clone(), busy_state.inner().clone(), Cow::Borrowed("Comparing..."))?;
    run_async_callback(app_handle, move |app_handle| {
        async move {
            let _wip = wip; // Move the WIP RAII inside async closure
            let res = clients.grpc(|loader, _, _| loader.ensure_same(compare_request)).await?;
            let mut encoded_res = Vec::new();
            EnsureSameResponse::encode(&res, &mut encoded_res).expect("encode EnsureSameResponse");
            app_handle.emit(EVENT_COMPARE_DATASETS_FINISHED, encoded_res).expect("send busy event");
            Ok(())
        }
    });
    Ok(())
}

#[tauri::command]
fn merge_datasets(
    merge_request: Vec<u8>,
    app_handle: AppHandle,
    clients: State<ChatHistoryManagerGrpcClients>,
    busy_state: State<BusyState>,
) -> tauri::Result<()> {
    use prost::Message;
    let merge_request = MergeRequest::decode(merge_request.as_slice()).map_err(|e| tauri::Error::CannotDeserializeScope(Box::new(e)))?;
    let mut clients = clients.inner().clone();
    let wip = WorkInProgress::start(app_handle.clone(), busy_state.inner().clone(), Cow::Borrowed("Merging..."))?;
    run_async_callback(app_handle, move |app_handle| {
        async move {
            let _wip = wip; // Move the WIP RAII inside async closure
            clients.grpc(|_, _, merger| merger.merge(merge_request)).await?;
            refresh_opened_files_list(app_handle, clients, true).await
        }
    });
    Ok(())
}

//
// Helpers
//

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct GrpcPort(u16);

// Should be used through the `WorkInProgress` RAII
#[derive(Debug, PartialEq, Eq, Deserialize)]
enum BusyStateValue {
    Busy(Cow<'static, str>),
    NotBusy,
}

// Should be used through the `WorkInProgress` RAII
type BusyState = Arc<Mutex<BusyStateValue>>;

/// RAII primitive, constructed as a try-finally block for a busy state
struct WorkInProgress {
    app_handle: AppHandle,
    state: BusyState,
}

impl WorkInProgress {
    fn start(app_handle: AppHandle, state: BusyState, message: Cow<'static, str>) -> tauri::Result<Self> {
        let mut locked = lock_mutex(&state);
        if !matches!(*locked, BusyStateValue::NotBusy) {
            return Err(tauri::Error::Anyhow(anyhow!("Work in progress!")));
        }
        app_handle.emit(EVENT_BUSY, &message).expect("send busy event");
        *locked = BusyStateValue::Busy(message);
        drop(locked);
        Ok(Self { app_handle, state })
    }
}

impl Drop for WorkInProgress {
    fn drop(&mut self) {
        *lock_mutex(&self.state) = BusyStateValue::NotBusy;
        self.app_handle.emit(EVENT_BUSY, None::<String>).expect("send busy event");
    }
}

/// Runs an async callback, not waiting for it to finish
fn run_async_callback<C, F>(app_handle: AppHandle, cb: C)
    where C: FnOnce(AppHandle) -> F + Send + 'static,
          F: Future<Output=Result<()>> + Send {
    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        handle_result!(cb(app_handle.clone()).await, app_handle);
    });
}

fn as_dyn_menu_items<'a, R: Runtime>(v: &'a [impl IsMenuItem<R> + 'a]) -> Vec<&'a dyn IsMenuItem<R>> {
    v.iter().map(|item| item as &dyn IsMenuItem<_>).collect_vec()
}

// We cannot recover from a poisoned mutex, so we just panic
fn lock_mutex<T, M>(m: &M) -> MutexGuard<T> where M: Deref<Target=Mutex<T>> {
    m.lock().expect("Mutex is poisoned")
}
