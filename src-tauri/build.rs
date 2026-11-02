fn main() {
    println!("cargo:rerun-if-env-changed=MUSICDAN_BUILD_NUMBER");
    let build = std::env::var("MUSICDAN_BUILD_NUMBER").unwrap_or_else(|_| "0".into());
    build
        .parse::<u64>()
        .expect("MUSICDAN_BUILD_NUMBER must be a positive integer or zero");
    println!("cargo:rustc-env=MUSICDAN_BUILD_NUMBER={build}");
    tauri_build::build()
}
