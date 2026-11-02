//! Membaca lagu yang sedang diputar dari panel media Windows
//! (Spotify, YouTube di browser, Apple Music, dll.) dan mengontrolnya.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Serialize, PartialEq, Default, Debug)]
pub struct MediaState {
    pub active: bool,
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub track_key: String,
    /// Waktu (unix ms) saat posisi di atas dihitung.
    pub sent_at: i64,
}

#[derive(Clone, Serialize)]
struct MediaArt {
    track_key: String,
    data_url: Option<String>,
}

fn unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(windows)]
mod imp {
    use super::*;
    use base64::Engine;
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::{Buffer, DataReader, InputStreamOptions};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    /// Selisih epoch FILETIME (1601) dan Unix (1970) dalam satuan 100ns.
    const EPOCH_DIFF_100NS: i64 = 116_444_736_000_000_000;

    pub fn com_init() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    pub fn manager() -> windows::core::Result<Manager> {
        Manager::RequestAsync()?.join()
    }

    pub fn current_session() -> windows::core::Result<Session> {
        manager()?.GetCurrentSession()
    }

    fn read_state(session: &Session) -> windows::core::Result<MediaState> {
        let props = session.TryGetMediaPropertiesAsync()?.join()?;
        let timeline = session.GetTimelineProperties()?;
        let playback = session.GetPlaybackInfo()?;
        let status = playback.PlaybackStatus()?;
        let playing = status == Status::Playing;

        let title = props.Title()?.to_string_lossy();
        let artist = props.Artist()?.to_string_lossy();
        let album = props.AlbumTitle().map(|s| s.to_string_lossy()).unwrap_or_default();
        let app = session
            .SourceAppUserModelId()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();

        let pos_100ns = timeline.Position()?.Duration;
        let end_100ns = timeline.EndTime()?.Duration;
        let updated_100ns = timeline.LastUpdatedTime()?.UniversalTime;
        let now = unix_ms();
        let mut position_ms = pos_100ns / 10_000;
        let duration_ms = end_100ns / 10_000;
        if playing && updated_100ns > 0 {
            let updated_ms = (updated_100ns - EPOCH_DIFF_100NS) / 10_000;
            let delta = now - updated_ms;
            // Abaikan nilai aneh dari aplikasi yang jarang memperbarui posisi
            if delta > 0 && delta < 6 * 60 * 60 * 1000 {
                position_ms += delta;
            }
        }
        if duration_ms > 0 {
            position_ms = position_ms.clamp(0, duration_ms);
        }

        Ok(MediaState {
            active: !title.is_empty(),
            track_key: format!("{}\u{1}{}\u{1}{}", app, title, artist),
            app,
            title,
            artist,
            album,
            playing,
            position_ms,
            duration_ms,
            sent_at: now,
        })
    }

    fn read_art(session: &Session) -> Option<String> {
        let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
        let thumb = props.Thumbnail().ok()?;
        let stream = thumb.OpenReadAsync().ok()?.join().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 8 * 1024 * 1024 {
            return None;
        }
        let buffer = Buffer::Create(size).ok()?;
        let filled = stream
            .ReadAsync(&buffer, size, InputStreamOptions::None)
            .ok()?
            .join()
            .ok()?;
        let len = filled.Length().ok()? as usize;
        let reader = DataReader::FromBuffer(&filled).ok()?;
        let mut bytes = vec![0u8; len];
        reader.ReadBytes(&mut bytes).ok()?;
        let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
            "image/png"
        } else {
            "image/jpeg"
        };
        Some(format!(
            "data:{};base64,{}",
            mime,
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        ))
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            com_init();
            let mut mgr: Option<Manager> = None;
            let mut last = MediaState::default();
            let mut last_emit = Instant::now() - Duration::from_secs(10);
            let mut art_key = String::new();
            let mut art_last: Option<String> = None;
            let mut art_retries: Vec<Instant> = Vec::new();

            loop {
                std::thread::sleep(Duration::from_millis(300));
                if mgr.is_none() {
                    mgr = manager().ok();
                    if mgr.is_none() {
                        std::thread::sleep(Duration::from_secs(2));
                        continue;
                    }
                }
                let session = mgr.as_ref().and_then(|m| m.GetCurrentSession().ok());
                let state = match &session {
                    Some(s) => read_state(s).unwrap_or_default(),
                    None => MediaState::default(),
                };

                // Kirim kalau ada yang berubah, atau tiap 1 detik untuk menyelaraskan posisi
                let mut cmp_a = state.clone();
                let mut cmp_b = last.clone();
                cmp_a.position_ms = 0;
                cmp_a.sent_at = 0;
                cmp_b.position_ms = 0;
                cmp_b.sent_at = 0;
                let seek_jump = (state.position_ms - last.position_ms).abs() > 1500 && state.playing == last.playing && !state.playing;
                if cmp_a != cmp_b || seek_jump || last_emit.elapsed() >= Duration::from_millis(1000) {
                    let _ = app.emit_to("island", "media", &state);
                    last_emit = Instant::now();
                }

                // Sampul album: dibaca saat lagu berganti, lalu dicoba lagi
                // beberapa kali karena aplikasi sering mengirimnya terlambat.
                if state.track_key != art_key {
                    art_key = state.track_key.clone();
                    art_last = None;
                    let now = Instant::now();
                    art_retries = vec![
                        now,
                        now + Duration::from_millis(1200),
                        now + Duration::from_millis(3500),
                        now + Duration::from_millis(8000),
                    ];
                }
                if let (Some(s), Some(due)) = (&session, art_retries.first().copied()) {
                    if Instant::now() >= due {
                        art_retries.remove(0);
                        let art = read_art(s);
                        if art.is_some() && art != art_last {
                            art_last = art.clone();
                            let _ = app.emit_to(
                                "island",
                                "media-art",
                                MediaArt { track_key: art_key.clone(), data_url: art },
                            );
                        }
                    }
                } else if session.is_none() && !art_retries.is_empty() {
                    art_retries.clear();
                }
                last = state;
            }
        });
    }

    pub fn control(action: &str, position_ms: Option<i64>) -> windows::core::Result<bool> {
        com_init();
        let s = current_session()?;
        let op = match action {
            "toggle" => s.TryTogglePlayPauseAsync()?,
            "play" => s.TryPlayAsync()?,
            "pause" => s.TryPauseAsync()?,
            "next" => s.TrySkipNextAsync()?,
            "prev" => s.TrySkipPreviousAsync()?,
            "seek" => s.TryChangePlaybackPositionAsync(position_ms.unwrap_or(0).max(0) * 10_000)?,
            _ => return Ok(false),
        };
        op.join()
    }
}

#[cfg(windows)]
pub fn start(app: AppHandle) {
    imp::start(app);
}

#[cfg(not(windows))]
pub fn start(_app: AppHandle) {}

#[tauri::command]
pub async fn media_control(action: String, position_ms: Option<i64>) -> Result<bool, String> {
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move || {
            imp::control(&action, position_ms).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (action, position_ms);
        Err("Hanya tersedia di Windows".into())
    }
}
