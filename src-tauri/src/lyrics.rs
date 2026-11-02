//! Mengambil lirik tersinkron dari LRCLIB (lrclib.net), perpustakaan
//! lirik gratis dari komunitas. Pencocokan dan sinkronisasi dilakukan di UI.

use serde_json::Value;
use std::sync::OnceLock;
use std::time::Duration;

const BASE: &str = "https://lrclib.net/api";

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!("LanskyIsland/", env!("CARGO_PKG_VERSION"), " (dynamic island untuk Windows)"))
            .timeout(Duration::from_secs(12))
            .build()
            .expect("http client")
    })
}

fn enc(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

/// Cari satu lagu yang cocok persis (judul + artis + durasi).
#[tauri::command]
pub async fn lyrics_get(
    track: String,
    artist: String,
    album: Option<String>,
    duration: Option<f64>,
) -> Result<Option<Value>, String> {
    let mut url = format!("{BASE}/get?track_name={}&artist_name={}", enc(&track), enc(&artist));
    if let Some(a) = album.filter(|a| !a.is_empty()) {
        url.push_str(&format!("&album_name={}", enc(&a)));
    }
    if let Some(d) = duration.filter(|d| *d > 0.0) {
        url.push_str(&format!("&duration={}", d.round() as i64));
    }
    let resp = client().get(url).send().await.map_err(|e| e.to_string())?;
    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("LRCLIB {}", resp.status()));
    }
    resp.json::<Value>().await.map(Some).map_err(|e| e.to_string())
}

/// Pencarian bebas, dipakai saat judul tidak rapi (misalnya dari YouTube atau Discord).
#[tauri::command]
pub async fn lyrics_search(
    q: Option<String>,
    track: Option<String>,
    artist: Option<String>,
) -> Result<Vec<Value>, String> {
    let mut params = Vec::new();
    if let Some(q) = q.filter(|s| !s.is_empty()) {
        params.push(format!("q={}", enc(&q)));
    }
    if let Some(t) = track.filter(|s| !s.is_empty()) {
        params.push(format!("track_name={}", enc(&t)));
    }
    if let Some(a) = artist.filter(|s| !s.is_empty()) {
        params.push(format!("artist_name={}", enc(&a)));
    }
    if params.is_empty() {
        return Ok(vec![]);
    }
    let url = format!("{BASE}/search?{}", params.join("&"));
    let resp = client().get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("LRCLIB {}", resp.status()));
    }
    resp.json::<Vec<Value>>().await.map_err(|e| e.to_string())
}
