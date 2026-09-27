use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

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

const OAUTH_DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>TaskDB</title>\
<body style=\"font:16px -apple-system,sans-serif;text-align:center;padding:80px\">\
<h2>TaskDB is connected to Notion</h2><p>You can close this tab and go back to TaskDB.</p>";

/// Starts a one-shot listener on 127.0.0.1 for the Notion sign-in redirect
/// (RFC 8252 loopback flow). Returns the port; the query string arrives as
/// an "oauth-callback" event. Gives up after 10 minutes.
#[tauri::command]
fn oauth_listen(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(600);
        while Instant::now() < deadline {
            let mut stream = match listener.accept() {
                Ok((stream, _)) => stream,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(200));
                    continue;
                }
            };
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut buf = [0u8; 16384];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);
            let target = request.split_whitespace().nth(1).unwrap_or("/");
            if let Some(query) = target.strip_prefix("/callback?") {
                let _ = write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    OAUTH_DONE_PAGE.len(),
                    OAUTH_DONE_PAGE
                );
                let _ = app.emit("oauth-callback", query.to_string());
                show_main(&app);
                return;
            }
            // Browsers may also ask for a favicon; ignore anything else.
            let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        }
    });
    Ok(port)
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
        .invoke_handler(tauri::generate_handler![secure_get, secure_set, secure_delete, oauth_listen])
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
