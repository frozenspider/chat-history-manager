// Disables the command prompt window that would normally pop up on Windows if run as a bundled app
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use std::str::FromStr;
use std::sync::{Arc, Mutex};

use lazy_static::lazy_static;
use tauri::{AppHandle, Manager, Runtime};
use tauri::menu::{Menu, MenuId, MenuItem, PredefinedMenuItem, Submenu};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

#[tauri::command]
fn open_popup(handle: AppHandle) {
    let file_path = "popup";
    let _settings_window = tauri::WebviewWindowBuilder::new(
        &handle,
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
fn report_error_string(handle: AppHandle, error: String) {
    log::error!("UI reported error: {}", error);
    handle.dialog()
        .message(error)
        .title("Error")
        .kind(MessageDialogKind::Error)
        .show(|_res| ()/*Ignore the result*/);
}

lazy_static! {
    static ref MENU_ID_DATABASE: MenuId = MenuId::from_str("database").unwrap();
    static ref MENU_ID_EDIT: MenuId = MenuId::from_str("edit").unwrap();

    static ref MENU_ID_OPEN: MenuId = MenuId::from_str("open").unwrap();
    static ref MENU_ID_USERS: MenuId = MenuId::from_str("users").unwrap();
    static ref MENU_ID_MERGE_DATASETS: MenuId = MenuId::from_str("merge_datasets").unwrap();
    static ref MENU_ID_COMPARE_DATASETS: MenuId = MenuId::from_str("compare_datasets").unwrap();
}

pub fn start() {
    let pre_db_sep_id = Arc::new(Mutex::<Option<MenuId>>::from(None));
    let pre_db_sep_id_clone = pre_db_sep_id.clone();

    let post_db_sep_id = Arc::new(Mutex::<Option<MenuId>>::from(None));
    let post_db_sep_id_clone = post_db_sep_id.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let handle = app.handle();

            let (menu, sep_id_1, sep_id_2) = create_menu(handle)?;
            *pre_db_sep_id_clone.lock().unwrap() = Some(sep_id_1);
            *post_db_sep_id_clone.lock().unwrap() = Some(sep_id_2);
            handle.set_menu(menu)?;

            handle.on_menu_event(move |handle, event| {
                match event.id() {
                    x if x == &*MENU_ID_OPEN => {
                        let pre_db_sep_id = pre_db_sep_id.lock()
                            .expect("lock separator 1 id")
                            .as_ref().expect("get separator 1 id value")
                            .clone();
                        let post_db_sep_id = post_db_sep_id.lock()
                            .expect("lock separator 2 id")
                            .as_ref().expect("get separator 2 id value")
                            .clone();
                        on_menu_event_open(handle, pre_db_sep_id, post_db_sep_id)
                            .expect("handle menu open click");
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_popup, report_error_string, read_file_base64])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn create_menu<R, M>(handle: &M) -> tauri::Result<(Menu<R>, MenuId, MenuId)> where R: Runtime, M: Manager<R> {
    let pre_db_sep = PredefinedMenuItem::separator(handle)?;
    let post_db_sep = PredefinedMenuItem::separator(handle)?;

    // First menu will be a main dropdown menu on macOS
    let file_menu = Submenu::with_id_and_items(
        handle, MENU_ID_DATABASE.clone(), "Database", true,
        &[
            &MenuItem::with_id(handle, MENU_ID_OPEN.clone(), "Open [NYI]", true, None::<&str>)?,
            &pre_db_sep,
            &post_db_sep,
            &PredefinedMenuItem::quit(handle, None)?,
        ])?;

    let edit_menu = Submenu::with_id_and_items(
        handle, MENU_ID_EDIT.clone(), "Edit", true,
        &[
            &MenuItem::with_id(handle, MENU_ID_USERS.clone(), "Users [NYI]", true, None::<&str>)?,
            &MenuItem::with_id(handle, MENU_ID_MERGE_DATASETS.clone(), "Merge Datasets [NYI]", true, None::<&str>)?,
            &MenuItem::with_id(handle, MENU_ID_COMPARE_DATASETS.clone(), "Compare Datasets [NYI]", true, None::<&str>)?,
        ])?;

    Ok((Menu::with_items(handle, &[&file_menu, &edit_menu])?, pre_db_sep.id().clone(), post_db_sep.id().clone()))
}

fn on_menu_event_open(handle: &AppHandle, pre_db_sep_id: MenuId, post_db_sep_id: MenuId) -> tauri::Result<()> {
    let handle = handle.clone();
    handle
        .dialog()
        .file()
        .add_filter("Own format", &["sqlite"])
        .pick_file(move |path_buf| match path_buf {
            Some(p) => {
                let menu = handle.menu().unwrap();
                let main_menu = &menu.items()
                    .expect("get menu items")[0];
                let main_menu = main_menu.as_submenu_unchecked();
                let items = main_menu.items()
                    .expect("get main menu items");
                let pre_db_sep_idx = items
                    .iter()
                    .position(|item| item.id() == &pre_db_sep_id)
                    .expect("find separator 1 position");
                let post_db_sep_idx = items
                    .iter()
                    .position(|item| item.id() == &post_db_sep_id)
                    .expect("find separator 2 position");

                for _ in (pre_db_sep_idx + 1)..post_db_sep_idx {
                    main_menu.remove_at(pre_db_sep_idx + 1)
                        .expect("remove db menu item");
                }
                let name = p.name.expect("picked file name");

                // TODO: Create a menu item for each loaded dao
                let new_item =
                    MenuItem::with_id(&handle, format!("db_{name}"), name, true, None::<&str>)
                        .expect("create menu item");

                main_menu.insert_items(&[&new_item], pre_db_sep_idx + 1)
                    .expect("add db menu item");
            }
            _ => { /* No file picked */ }
        });
    Ok(())
}
