fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri_build::build();

    #[cfg(feature = "run-before-build-command")]
    run_tauri_before_build_command()?;

    Ok(())
}

#[cfg(feature = "run-before-build-command")]
fn run_tauri_before_build_command() -> Result<(), Box<dyn std::error::Error>> {
    use std::fs::File;
    use std::io::Read;
    use std::path::PathBuf;

    macro_rules! warn {
        ($($tokens: tt)*) => {
            println!("cargo::warning={}", format!($($tokens)*))
        }
    }

    let mut tauri_toml_file = File::open("Tauri.toml")?;
    let mut tauri_toml_string = String::new();
    tauri_toml_file.read_to_string(&mut tauri_toml_string)?;

    let tauri_toml: toml::Table = tauri_toml_string.parse()?;
    let before_build_command = tauri_toml["build"]["before-build-command"].as_str().unwrap();

    let mut opts = run_script::ScriptOptions::new();
    opts.working_directory = Some(PathBuf::from(".").join("frontend"));

    let (code, stdout, stderr) =
        run_script::run(before_build_command, &vec![], &opts)?;

    if code != 0 {
        warn!("Failed to run before build command");
        warn!("status: {}", code);
        warn!("stdout: {}", stdout);
        warn!("stderr: {}", stderr);
        Err("Failed to run before build command".into())
    } else {
        warn!("Tauri before build command");
        warn!("stdout: {}", stdout);
        warn!("stderr: {}", stderr);
        Ok(())
    }
}
