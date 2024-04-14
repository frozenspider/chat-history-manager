// Disables the command prompt window that would normally pop up on Windows if run as a bundled app
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::future::Future;
use std::path::Path;
use std::str::FromStr;
use std::sync::{Arc, Mutex, OnceLock};
use itertools::Itertools;

use lazy_static::lazy_static;
use tauri::{AppHandle, Manager, Runtime};
use tauri::menu::{IsMenuItem, Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use chat_history_manager_backend::prelude::*;

/// Proceed with the result value, or report UI error and return
macro_rules! handle_result {
    ($res:expr, $app_handle:ident) => {
        match $res {
            Ok(v) => v,
            Err(e) => {
                report_error_string($app_handle.clone(), e.to_string());
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

static MENU_PRE_DB_SEPARATOR: OnceLock<MenuId> = OnceLock::new();
static MENU_POST_DB_SEPARATOR: OnceLock<MenuId> = OnceLock::new();

static EVENT_OPEN_FILES_CHANGED: &str = "open-files-changed";

pub async fn start(clients: client::ChatHistoryManagerGrpcClients) {
    let clients = Arc::new(Mutex::new(clients));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let app_handle = app.handle();

            let menu = create_menu_once(app_handle)?;
            app_handle.set_menu(menu)?;

            app_handle.on_menu_event(move |app_handle, event| {
                let app_handle = app_handle.clone();
                let clients = handle_result!(clients.lock(), app_handle).clone();
                run_async_callback(
                    app_handle,
                    move |app_handle| on_menu_event(event, app_handle, clients),
                );
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_popup, report_error_string, read_file_base64])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn create_menu_once<R, M>(app_handle: &M) -> tauri::Result<Menu<R>> where R: Runtime, M: Manager<R> {
    if !MENU_PRE_DB_SEPARATOR.get().is_none() || !MENU_POST_DB_SEPARATOR.get().is_none() {
        let err = Box::<dyn StdError>::from(anyhow!("create_menu_once has already been called!"));
        return Err(tauri::Error::Setup(err.into()));
    }
    let pre_db_sep = PredefinedMenuItem::separator(app_handle)?;
    let post_db_sep = PredefinedMenuItem::separator(app_handle)?;

    MENU_PRE_DB_SEPARATOR.set(pre_db_sep.id().clone()).expect("setting pre-DB separator");
    MENU_POST_DB_SEPARATOR.set(post_db_sep.id().clone()).expect("setting post-DB separator");

    // First menu will be a main dropdown menu on macOS
    let file_menu = Submenu::with_id_and_items(
        app_handle, MENU_ID_DATABASE.clone(), "Database", true,
        &[
            &MenuItem::with_id(app_handle, MENU_ID_OPEN.clone(), "Open [NYI]", true, None::<&str>)?,
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

    Menu::with_items(app_handle, &[&file_menu, &edit_menu])
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
            clients.loader.close(CloseRequest { key }).await?;
            refresh_opened_files_list(app_handle, clients).await?;
        }
        _ => {}
    };
    Ok(())
}

async fn on_menu_event_open(
    app_handle: AppHandle,
    mut clients: client::ChatHistoryManagerGrpcClients,
) -> Result<()> {
    let picked = app_handle
        .dialog()
        .file()
        .add_filter("Own format", &["sqlite"])
        .blocking_pick_file();
    match picked {
        Some(picked) => {
            let path = path_to_str(&picked.path)?.to_owned();
            let key = path.clone();
            let _response = clients.loader.load(LoadRequest { key, path }).await?;
            refresh_opened_files_list(app_handle, clients).await?;
        }
        _ => { /* No file picked */ }
    };
    Ok(())
}

async fn refresh_opened_files_list(
    app_handle: AppHandle,
    mut clients: client::ChatHistoryManagerGrpcClients,
) -> Result<()> {
    let menu = app_handle.menu().expect("get menu");
    let menu_items = menu.items()?;
    let main_menu = menu_items[0].as_submenu().expect("get submenu");
    let items = main_menu.items()?;
    let (pre_db_sep_idx, post_db_sep_idx) = {
        let pre_db_sep_id = MENU_PRE_DB_SEPARATOR.get().expect("get pre-DB separator");
        let post_db_sep_id = MENU_POST_DB_SEPARATOR.get().expect("get post-DB separator");
        (items.iter().position(|item| item.id() == &pre_db_sep_id).expect("find separator 1 position"),
         items.iter().position(|item| item.id() == &post_db_sep_id).expect("find separator 2 position"))
    };

    let loaded_files = clients.loader.get_loaded_files(Empty {}).await?;
    let loaded_files = &loaded_files.get_ref().files;

    let new_items: StdResult<Vec<Submenu<_>>, _> = loaded_files.iter()
        .map(|loaded_file| Submenu::with_id_and_items(
            &app_handle, &loaded_file.key, &loaded_file.name, true,
            &[
                &MenuItem::with_id(&app_handle, format!("{MENU_PREFIX_SAVE_AS}_{}", loaded_file.key),
                                   "Save As [NYI]", true, None::<&str>)?,
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

    // Trigger JS refresh
    app_handle.emit(EVENT_OPEN_FILES_CHANGED, ())?;

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

//
// Helpers
//

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
