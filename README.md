# Lansky Island

Dynamic island untuk Windows 10 dan 11: musik dan lirik tersinkron di tepi atas layar, termasuk **lirik lagu yang diputar bot musik Discord** (Jockie, dll.).

## Unduh

**[⬇ LanskyIsland-Setup.exe](https://github.com/YanLansky/gema-island/releases/latest/download/LanskyIsland-Setup.exe)** (installer, disarankan)

Atau versi tanpa instalasi: [LanskyIsland-Portable.exe](https://github.com/YanLansky/gema-island/releases/latest/download/LanskyIsland-Portable.exe)

Muncul **"Windows protected your PC"**? Klik **More info** → **Run anyway**. Peringatan ini muncul karena aplikasinya belum punya sertifikat tanda tangan berbayar, bukan karena virus.

## Fitur (tahap 1)

- Island dengan animasi pegas yang memantul dan memanjang, mode **Dynamic** (melayang) atau **Notch** (menempel di tepi atas)
- Lagu dari Spotify, YouTube di browser, Apple Music, dan pemutar lain yang muncul di panel media Windows
- Lirik tersinkron dari [LRCLIB](https://lrclib.net); klik baris untuk lompat ke bagian itu
- Lirik berjalan langsung di island kecil, dan island melebar mengikuti panjang barisnya
- **Lagu dari bot musik Discord**: bot pribadimu membaca pesan "Now Playing" lalu liriknya tampil di island
- Kartu kecil saat lagu berganti, warna aksen mengikuti sampul album
- Scroll di atas island untuk mengatur volume
- Robot mata saat sepi: melirik ke kursor, berkedip, mengantuk, marah saat baterai hampir habis, senang saat charger dicolok
- Sembunyi otomatis saat game atau video layar penuh
- Ikon di tray dan jendela pengaturan; bisa jalan otomatis saat Windows mulai

## Cara pakai

- **Arahkan kursor** ke island untuk membukanya. Tab di bawah: Musik dan Hari ini. Roda gigi membuka pengaturan.
- **Scroll** di atas island untuk volume, **geser ke samping** untuk pindah tab.
- Pengaturan juga bisa dibuka dengan klik ikon Lansky Island di tray (dekat jam).

## Menyambungkan Discord

Ikuti panduan di **Pengaturan → Discord → Panduan**. Singkatnya:

1. Buat aplikasi di [Discord Developer Portal](https://discord.com/developers/applications), buka menu **Bot**, salin token-nya.
2. Nyalakan **Message Content Intent** di halaman Bot.
3. Undang bot ke servermu lewat **OAuth2 → URL Generator** (centang `bot`, izin *View Channels* dan *Read Message History*).
4. Tempel token di pengaturan Lansky Island, isi ID Discord-mu, lalu nyalakan sakelarnya.

Token hanya disimpan di laptopmu dan tidak pernah masuk ke repo ini.

Kalau lagu dari bot musik tidak terbaca, buka **Pengaturan → Discord → Pesan terakhir dari bot musik**, salin isinya, dan kirim supaya pembacanya bisa disesuaikan.

## Rencana berikutnya

- **Tahap 2:** timer/pomodoro, shelf file, tangkap layar, overlay Caps Lock, unduhan
- **Tahap 3:** mode rapat, notifikasi, kalender, kirim file ke HP, istirahat mata, update otomatis

## Untuk pengembang

Dibuat dengan [Tauri 2](https://tauri.app) (Rust) dan HTML/CSS/JS tanpa framework.

- `ui/` tampilan island dan pengaturan (bisa dibuka langsung di browser untuk pratinjau)
- `src-tauri/src/` bagian Rust: jendela, klik tembus, media Windows, volume, baterai, lirik
- `.github/workflows/build.yml` merakit `.exe` otomatis di GitHub setiap ada perubahan di `main`

Rakit sendiri di Windows: pasang Rust dan Node, lalu `npx @tauri-apps/cli@^2 build`.
