use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

const KEYCHAIN_SERVICE: &str = "app.taskdb.desktop";
/// Only these Keychain items can be touched from the web layer.
const KEYCHAIN_ACCOUNTS: &[&str] = &["notion-token", "license", "trial-start"];

fn keychain(account: &str) -> Result<keyring::Entry, String> {
    if !KEYCHAIN_ACCOUNTS.contains(&account) {
        return Err(format!("unknown keychain item: {account}"));
    }
    keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|e| e.to_string())
}

/// Secrets (Notion token, license, trial start) live in the macOS Keychain,
/// so they survive reinstalls and never sit in the app's files.
#[tauri::command]
fn secure_get(account: String) -> Result<Option<String>, String> {
    match keychain(&account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secure_set(account: String, value: String) -> Result<(), String> {
    keychain(&account)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_delete(account: String) -> Result<(), String> {
    match keychain(&account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![secure_get, secure_set, secure_delete])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open TaskDB", true, None::<&str>)?;
            let quick = MenuItem::with_id(app, "quick", "Quick Add…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit TaskDB", true, Some("CmdOrCtrl+Q"))?;
            let menu = Menu::with_items(app, &[&open, &quick, &quit])?;
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().cloned().expect("app icon missing"))
                .tooltip("TaskDB")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quick" => {
                        show_main(app);
                        let _ = app.emit("quick-add", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps TaskDB in the menu bar so sync and reminders continue.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building TaskDB")
        .run(|_app, _event| {
            // Clicking the Dock icon brings the hidden window back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_main(_app);
            }
        });
}
