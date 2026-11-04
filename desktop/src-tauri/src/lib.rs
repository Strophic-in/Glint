mod api;
mod audio;
mod auth;
mod commands;
mod docs;
mod listen;
mod screen;
mod shortcuts;
mod state;
mod win;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition};

const WIDTH: f64 = 720.0;

pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch just reveals the running overlay.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| win::reveal(app)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(w) = win::overlay(&handle) {
                // Top-centre of the primary monitor.
                if let Ok(Some(m)) = w.primary_monitor() {
                    let scale = m.scale_factor();
                    let x = m.position().x + ((m.size().width as f64 - WIDTH * scale) / 2.0) as i32;
                    let y = m.position().y + (12.0 * scale) as i32;
                    let _ = w.set_position(PhysicalPosition::new(x, y));
                }
                win::set_noactivate(&w, true);
                win::set_protected(&w, true);
            }
            win::reveal(&handle);
            shortcuts::apply(&handle);
            build_tray(app)?;

            let api = handle.state::<state::AppState>().api.clone();
            tauri::async_runtime::spawn(async move { api.warm().await });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::auth_status,
            commands::auth_begin,
            commands::auth_cancel,
            commands::logout,
            commands::me,
            commands::models,
            commands::listen_start,
            commands::listen_stop,
            commands::ask,
            commands::ask_cancel,
            commands::set_bindings,
            commands::default_bindings,
            commands::set_contextual_keys,
            commands::suspend_shortcuts,
            commands::set_typing,
            commands::set_protected,
            commands::resize,
            commands::set_zoom,
            commands::drag_window,
            commands::pick_document,
            commands::list_mics,
            commands::list_outputs,
            commands::open_url,
            commands::hide,
            commands::quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glint");
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Expand / collapse\tCtrl+\\", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide completely", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Glint", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &settings, &hide, &quit])?;
    let mut tray = TrayIconBuilder::with_id("glint")
        .tooltip("Glint")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => shortcuts::handle(app, "toggle"),
            "settings" => shortcuts::handle(app, "settings"),
            "hide" => win::conceal(app),
            "quit" => {
                app.state::<state::AppState>().stop_listen();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                win::reveal(app);
                let _ = app.emit("shortcut", "expand");
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
