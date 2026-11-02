//! Klik tembus: jendela island ukurannya tetap, tapi hanya bagian yang
//! benar-benar berisi island yang menerima klik. Sisanya tembus ke
//! aplikasi di belakangnya. Posisi kursor juga dikirim ke tampilan
//! supaya mata robot bisa melirik dan island tahu kapan disentuh kursor.

use crate::SharedState;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct Pointer {
    x: f64,
    y: f64,
    inside: bool,
}

#[cfg(windows)]
fn cursor_physical() -> Option<(f64, f64)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x as f64, p.y as f64))
}

#[cfg(not(windows))]
fn cursor_physical() -> Option<(f64, f64)> {
    None
}

pub fn start(app: AppHandle, state: SharedState) {
    std::thread::spawn(move || {
        let mut last_inside = false;
        let mut last_sent = Instant::now();
        let mut last_xy = (f64::NAN, f64::NAN);
        loop {
            std::thread::sleep(Duration::from_millis(16));
            let Some((cx, cy)) = cursor_physical() else { continue };
            let (lx, ly, inside) = {
                let Ok(s) = state.lock() else { continue };
                let scale = if s.scale > 0.0 { s.scale } else { 1.0 };
                let lx = (cx - s.win_x) / scale;
                let ly = (cy - s.win_y) / scale;
                let inside = s.force_interactive
                    || s.rects.iter().any(|r| {
                        r.w > 0.0 && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h
                    });
                (lx, ly, inside)
            };

            if inside != last_inside {
                last_inside = inside;
                if let Some(win) = app.get_webview_window("island") {
                    let _ = win.set_ignore_cursor_events(!inside);
                }
                let _ = app.emit_to("island", "pointer", Pointer { x: lx, y: ly, inside });
                last_sent = Instant::now();
                last_xy = (lx, ly);
                continue;
            }

            // Kirim posisi kursor ~30 kali per detik, hanya kalau bergerak
            let moved = (lx - last_xy.0).abs() > 0.5 || (ly - last_xy.1).abs() > 0.5;
            if moved && last_sent.elapsed() >= Duration::from_millis(33) {
                let _ = app.emit_to("island", "pointer", Pointer { x: lx, y: ly, inside });
                last_sent = Instant::now();
                last_xy = (lx, ly);
            }
        }
    });
}
