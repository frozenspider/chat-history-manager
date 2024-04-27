// Disables the command prompt window that would normally pop up on Windows if run as a bundled app
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::borrow::Cow;
use std::fs;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{Arc, Mutex, MutexGuard};

use itertools::Itertools;
use lazy_static::lazy_static;
use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri::menu::{IsMenuItem, Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use chat_history_manager_backend::prelude::*;
use chat_history_manager_backend::prelude::client;

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

static EVENT_OPEN_FILES_CHANGED: &str = "open-files-changed";
static EVENT_SAVE_AS_CLICKED: &str = "save-as-clicked";
static EVENT_BUSY: &str = "busy";

pub async fn start(clients: client::ChatHistoryManagerGrpcClients) {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(GrpcClients::new(Mutex::new(clients)))
        .manage(BusyState::new(Mutex::new(BusyStateValue::NotBusy)))
        .setup(move |app| {
            let app_handle = app.handle();

            let (menu, separator_ids) = create_menu_once(app_handle)?;
            app_handle.set_menu(menu)?;
            assert!(app_handle.manage(separator_ids));

            let clients = lock_mutex(&app.state::<GrpcClients>()).clone();

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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_popup, report_error_string, read_file_base64, save_as])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

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
            &MenuItem::with_id(app_handle, MENU_ID_USERS.clone(), "Users [NYI]", true, None::<&str>)?,
            &MenuItem::with_id(app_handle, MENU_ID_MERGE_DATASETS.clone(), "Merge Datasets [NYI]", true, None::<&str>)?,
            &MenuItem::with_id(app_handle, MENU_ID_COMPARE_DATASETS.clone(), "Compare Datasets [NYI]", true, None::<&str>)?,
        ])?;

    Ok((Menu::with_items(app_handle, &[&file_menu, &edit_menu])?, separator_ids))
}

async fn on_menu_event(
    event: MenuEvent,
    app_handle: AppHandle,
    mut clients: client::ChatHistoryManagerGrpcClients,
) -> Result<()> {
    match event.id() {
        menu_id if menu_id == &*MENU_ID_OPEN => {
            on_menu_event_open(app_handle, clients).await?;
        }
        menu_id if menu_id.0.starts_with(MENU_PREFIX_CLOSE) => {
            let key = menu_id.0[(MENU_PREFIX_CLOSE.len() + 1)..].to_owned();
            clients.grpc(|loader, _| loader.close(CloseRequest { key })).await?;
            refresh_opened_files_list(app_handle, clients, true).await?;
        }
        menu_id if menu_id.0.starts_with(MENU_PREFIX_SAVE_AS) => {
            let key = menu_id.0[(MENU_PREFIX_SAVE_AS.len() + 1)..].to_owned();
            let storage_path_response =
                clients.grpc(|_, dao| dao.storage_path(StoragePathRequest { key: key.clone() })).await?;
            let path = PathBuf::from(storage_path_response.path);
            let old_file_name = path_file_name(&path)?;
            app_handle.emit(EVENT_SAVE_AS_CLICKED, (key, old_file_name))?;
        }
        _ => {}
    };
    Ok(())
}

async fn on_menu_event_open(
    app_handle: AppHandle,
    mut clients: client::ChatHistoryManagerGrpcClients,
) -> Result<()> {
    // We cannot add custom file filters here, and extension filter is not enough.
    // As a workaround, user can select any file.
    let picked = app_handle
        .dialog()
        .file()
        .set_title("Open one of the supported file types (see README.md)")
        .blocking_pick_file();
    match picked {
        Some(picked) => {
            let path = path_to_str(&picked.path)?.to_owned();
            let key = path.clone();
            let _response = clients.grpc(|loader, _| loader.load(LoadRequest { key, path })).await?;
            refresh_opened_files_list(app_handle, clients, true).await?;
        }
        _ => { /* No file picked */ }
    };
    Ok(())
}

async fn refresh_opened_files_list(
    app_handle: AppHandle,
    mut clients: client::ChatHistoryManagerGrpcClients,
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

    let loaded_files = clients.grpc(|loader, _| loader.get_loaded_files(Empty {})).await?;
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
fn open_popup(app_handle: AppHandle) {
    let file_path = "popup";
    let _settings_window = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "my-popup", /* the unique window label */
        tauri::WebviewUrl::App(file_path.into()),
    )
        .title("My Popup")
        .build()
        .unwrap();
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
fn report_error_string(app_handle: AppHandle, error: String) {
    log::error!("UI reported error: {}", error);
    app_handle.dialog()
        .message(error)
        .title("Error")
        .kind(MessageDialogKind::Error)
        .show(|_res| ()/*Ignore the result*/);
}

// #[tauri::command(rename_all = "snake_case")]
#[tauri::command]
fn save_as(
    key: String,
    new_name: String,
    app_handle: AppHandle,
    clients: State<GrpcClients>,
    busy_state: State<BusyState>,
) -> tauri::Result<()> {
    let mut clients = lock_mutex(&clients).clone();
    let wip = WorkInProgress::start(app_handle.clone(), busy_state.inner().clone(), Cow::Borrowed("Saving..."))?;
    run_async_callback(app_handle, move |app_handle| {
        let inner = async move {
            let _wip = wip; // Move the WIP RAII inside async closure
            clients.grpc(|_, dao| dao.save_as(SaveAsRequest { key, new_folder_name: new_name })).await?;
            refresh_opened_files_list(app_handle, clients.clone(), true).await
        };
        inner
    });
    Ok(())
}

//
// Helpers
//

type GrpcClients = Arc<Mutex<client::ChatHistoryManagerGrpcClients>>;

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
        app_handle.emit(EVENT_BUSY, message.to_owned()).expect("send busy event");
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
fn lock_mutex<T>(m: &Arc<Mutex<T>>) -> MutexGuard<'_, T> {
    m.lock().expect("Mutex is poisoned")
}
