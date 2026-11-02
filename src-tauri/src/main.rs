// Sembunyikan jendela konsol di versi rilis Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lansky_lib::run()
}
