//! Lansky Island: dynamic island untuk Windows.
//!
//! Bagian Rust mengurus hal yang butuh akses sistem: posisi jendela,
//! klik tembus (click-through), info media Windows, volume, baterai,
//! deteksi layar penuh, dan pengambilan lirik dari LRCLIB.
//! Semua tampilan dan animasi ada di folder `ui/`.

mod hit;
mod lyrics;
mod media;
mod system;

use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

pub const ISLAND_W: f64 = 820.0;
pub const ISLAND_H: f64 = 520.0;

/// Area island (dalam koordinat logis jendela) yang boleh menerima klik.
#[derive(Clone, Copy, Debug, Default, serde::Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Default)]
pub struct Shared {
    pub rects: Vec<Rect>,
    /// Posisi jendela island dalam piksel fisik + skala layar.
    pub win_x: f64,
    pub win_y: f64,
    pub scale: f64,
    /// Island sedang memaksa menerima klik (misalnya saat menyeret file).
    pub force_interactive: bool,
}

pub type SharedState = Arc<Mutex<Shared>>;

#[tauri::command]
fn set_hit_rects(state: tauri::State<SharedState>, rects: Vec<Rect>) {
    if let Ok(mut s) = state.lock() {
        s.rects = rects;
    }
}

#[tauri::command]
fn set_force_interactive(state: tauri::State<SharedState>, on: bool) {
    if let Ok(mut s) = state.lock() {
        s.force_interactive = on;
    }
}

#[tauri::command]
async fn open_settings(app: AppHandle) {
    show_settings(&app);
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    let r = if enabled { al.enable() } else { al.disable() };
    r.map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

fn show_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Pengaturan Lansky Island")
        .inner_size(620.0, 760.0)
        .min_inner_size(500.0, 520.0)
        .center()
        .build();
}

/// Letakkan jendela island di tengah atas monitor utama.
pub fn place_island(app: &AppHandle, state: &SharedState) {
    let Some(win) = app.get_webview_window("island") else { return };
    let monitor = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let scale = m.scale_factor();
    let _ = win.set_size(tauri::LogicalSize::new(ISLAND_W, ISLAND_H));
    let w_phys = ISLAND_W * scale;
    let x = m.position().x as f64 + (m.size().width as f64 - w_phys) / 2.0;
    let y = m.position().y as f64;
    let _ = win.set_position(tauri::PhysicalPosition::new(x.round() as i32, y.round() as i32));
    if let Ok(mut s) = state.lock() {
        s.win_x = x.round();
        s.win_y = y.round();
        s.scale = scale;
    }
}

pub fn run() {
    let state: SharedState = Arc::new(Mutex::new(Shared {
        scale: 1.0,
        ..Default::default()
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_settings(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            set_hit_rects,
            set_force_interactive,
            open_settings,
            get_autostart,
            set_autostart,
            quit_app,
            app_version,
            media::media_control,
            system::get_volume,
            system::set_volume,
            system::power_status,
            lyrics::lyrics_get,
            lyrics::lyrics_search,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // Ikon tray di dekat jam
            let settings_i = MenuItem::with_id(app, "settings", "Pengaturan", true, None::<&str>)?;
            let replace_i = MenuItem::with_id(app, "replace", "Posisikan ulang island", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_i, &replace_i, &sep, &quit_i])?;
            let tray_state = state.clone();
            let mut tray = TrayIconBuilder::with_id("lansky")
                .tooltip("Lansky Island")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "settings" => show_settings(app),
                    "replace" => place_island(app, &tray_state),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_settings(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            place_island(&handle, &state);
            if let Some(win) = handle.get_webview_window("island") {
                let _ = win.set_ignore_cursor_events(true);
                let _ = win.show();
            }

            hit::start(handle.clone(), state.clone());
            media::start(handle.clone());
            system::start(handle.clone(), state.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Lansky Island gagal dijalankan");
}
