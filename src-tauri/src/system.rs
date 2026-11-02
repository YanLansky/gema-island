//! Info sistem: volume, baterai, deteksi aplikasi layar penuh,
//! dan penyesuaian posisi saat monitor berubah.

use crate::SharedState;
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize, PartialEq, Default, Debug)]
pub struct Power {
    pub has_battery: bool,
    pub percent: i32,
    pub charging: bool,
    pub plugged: bool,
}

#[derive(Clone, Serialize)]
pub struct Volume {
    pub level: f32,
    pub muted: bool,
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect};

    pub fn power() -> Power {
        let mut s = SYSTEM_POWER_STATUS::default();
        if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
            return Power::default();
        }
        let has_battery = s.BatteryFlag != 128 && s.BatteryFlag != 255;
        Power {
            has_battery,
            percent: if s.BatteryLifePercent == 255 { 100 } else { s.BatteryLifePercent as i32 },
            charging: (s.BatteryFlag & 8) != 0,
            plugged: s.ACLineStatus == 1,
        }
    }

    fn endpoint() -> windows::core::Result<IAudioEndpointVolume> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
        }
    }

    pub fn get_volume() -> windows::core::Result<Volume> {
        let ep = endpoint()?;
        unsafe {
            Ok(Volume {
                level: ep.GetMasterVolumeLevelScalar()?,
                muted: ep.GetMute()?.as_bool(),
            })
        }
    }

    pub fn set_volume(level: f32) -> windows::core::Result<Volume> {
        let ep = endpoint()?;
        let level = level.clamp(0.0, 1.0);
        unsafe {
            ep.SetMasterVolumeLevelScalar(level, std::ptr::null())?;
            if level > 0.0 && ep.GetMute()?.as_bool() {
                ep.SetMute(false, std::ptr::null())?;
            }
        }
        get_volume()
    }

    /// Apakah jendela paling depan menutupi seluruh monitor (game, video, slide)?
    pub fn foreground_fullscreen(own_hwnd: isize) -> bool {
        unsafe {
            let fg: HWND = GetForegroundWindow();
            if fg.0.is_null() || fg.0 as isize == own_hwnd {
                return false;
            }
            let mut buf = [0u16; 64];
            let n = GetClassNameW(fg, &mut buf);
            let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
            if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                return false;
            }
            let mut r = RECT::default();
            if GetWindowRect(fg, &mut r).is_err() {
                return false;
            }
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(mon, &mut mi).as_bool() {
                return false;
            }
            let m = mi.rcMonitor;
            r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
        }
    }
}

#[tauri::command]
pub async fn get_volume() -> Result<Volume, String> {
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(|| imp::get_volume().map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    Err("Hanya tersedia di Windows".into())
}

#[tauri::command]
pub async fn set_volume(level: f32) -> Result<Volume, String> {
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move || imp::set_volume(level).map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = level;
        Err("Hanya tersedia di Windows".into())
    }
}

#[tauri::command]
pub fn power_status() -> Power {
    #[cfg(windows)]
    {
        return imp::power();
    }
    #[cfg(not(windows))]
    Power::default()
}

pub fn start(app: AppHandle, state: SharedState) {
    std::thread::spawn(move || {
        let mut last_full = false;
        let mut last_power = Power::default();
        let mut last_geom = String::new();
        let mut tick: u64 = 0;
        loop {
            std::thread::sleep(Duration::from_millis(700));
            tick += 1;

            #[cfg(windows)]
            {
                let own = app
                    .get_webview_window("island")
                    .and_then(|w| w.hwnd().ok())
                    .map(|h| h.0 as isize)
                    .unwrap_or(0);
                let full = imp::foreground_fullscreen(own);
                if full != last_full {
                    last_full = full;
                    let _ = app.emit_to("island", "fullscreen", full);
                }

                let p = imp::power();
                if p != last_power {
                    last_power = p.clone();
                    let _ = app.emit_to("island", "power", p);
                }
            }

            // Tiap ~3 detik: cek apakah monitor/skala berubah, lalu posisikan ulang
            if tick % 4 == 0 {
                if let Some(win) = app.get_webview_window("island") {
                    if let Ok(Some(m)) = win.primary_monitor() {
                        let geom = format!(
                            "{}:{}:{}:{}:{}",
                            m.position().x,
                            m.position().y,
                            m.size().width,
                            m.size().height,
                            m.scale_factor()
                        );
                        if geom != last_geom {
                            last_geom = geom;
                            crate::place_island(&app, &state);
                        }
                    }
                }
            }
            let _ = (&last_full, &last_power);
        }
    });
}
