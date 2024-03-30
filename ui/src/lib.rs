// Disables the command prompt window that would normally pop up on Windows if run as a bundled app
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use std::str::FromStr;

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
    static ref MENU_ID_OPEN: MenuId = MenuId::from_str("open").unwrap();
}

pub fn start() {
    fn make_menu<R, M>(handle: &M) -> tauri::Result<Menu<R>>
        where R: Runtime, M: Manager<R>
    {
        // First menu will be a main dropdown menu on macOS
        let file_menu = Submenu::with_items(
            handle, "File", true,
            &[
                &MenuItem::with_id(handle, MENU_ID_OPEN.clone(), "Open", true, None::<&str>)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::quit(handle, None)?,
            ])?;

        Menu::with_items(handle, &[&file_menu])
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();
            app.set_menu(make_menu(handle)?)?;
            app.on_menu_event(move |app, event| match event.id() {
                x if x == &*MENU_ID_OPEN => {
                    app.dialog()
                        .file()
                        .add_filter("Markdown", &["md"])
                        .pick_file(|path_buf| match path_buf {
                            Some(p) => { println!("Selected {p:?}") }
                            _ => {}
                        });
                }
                _ => {}
            });

            Ok(())
        })
        .menu(|handle| {
            make_menu(handle)
        })
        .invoke_handler(tauri::generate_handler![open_popup, report_error_string, read_file_base64])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
