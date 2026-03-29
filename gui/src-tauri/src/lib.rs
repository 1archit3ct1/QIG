use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize)]
struct SimulationOutput {
  simulation: String,
  command: String,
  exit_code: i32,
  success: bool,
  stdout: String,
  stderr: String,
}

fn simulation_script(simulation: &str) -> Option<&'static str> {
  match simulation {
    "all" => Some("run_all_demos.py"),
    "geometry" => Some("demos/demo_geometry.py"),
    "holographic" => Some("demos/demo_holographic.py"),
    "complexity_compiler" => Some("demos/demo_complexity_compiler.py"),
    _ => None,
  }
}

fn repo_root() -> PathBuf {
  let base = Path::new(env!("CARGO_MANIFEST_DIR"))
    .join("..")
    .join("..");
  base.canonicalize().unwrap_or(base)
}

fn shell_escape_single_quoted(value: &str) -> String {
  value.replace('\'', "'\\''")
}

fn to_wsl_path(path: &Path) -> String {
  let mut raw = path.to_string_lossy().to_string();

  // Strip Windows extended-length prefixes that break WSL path translation.
  if let Some(stripped) = raw.strip_prefix(r"\\?\") {
    raw = stripped.to_string();
  }
  if let Some(stripped) = raw.strip_prefix("//?/") {
    raw = stripped.to_string();
  }

  let raw = raw.replace('\\', "/");
  let bytes = raw.as_bytes();
  if bytes.len() > 2 && bytes[1] == b':' {
    let drive = raw[0..1].to_lowercase();
    let rest = &raw[3..];
    format!("/mnt/{drive}/{rest}")
  } else {
    raw
  }
}

fn run_linux(script: &str, root: &Path) -> Result<(String, String, i32, String), String> {
  let root_linux = to_wsl_path(root);
  let root_escaped = shell_escape_single_quoted(&root_linux);
  let script_escaped = shell_escape_single_quoted(script);
  let cmd = format!(
    "cd '{root_escaped}' && source .venv-linux/bin/activate && python3 '{script_escaped}'"
  );

  let output = Command::new("wsl")
    .args(["-e", "bash", "-lc", &cmd])
    .output()
    .map_err(|e| format!("failed to run WSL command: {e}"))?;

  let code = output.status.code().unwrap_or(-1);
  Ok((
    String::from_utf8_lossy(&output.stdout).to_string(),
    String::from_utf8_lossy(&output.stderr).to_string(),
    code,
    format!("wsl -e bash -lc {cmd}"),
  ))
}

fn run_native(script: &str, root: &Path) -> Result<(String, String, i32, String), String> {
  let venv_python = root.join(".venv").join("Scripts").join("python.exe");
  let script_path = root.join(script);

  let (cmd_display, mut cmd) = if venv_python.exists() {
    let mut c = Command::new(&venv_python);
    c.arg(&script_path).current_dir(root);
    (
      format!("{} {}", venv_python.to_string_lossy(), script),
      c,
    )
  } else {
    let mut c = Command::new("python");
    c.arg(&script_path).current_dir(root);
    (format!("python {}", script), c)
  };

  let output = cmd
    .output()
    .map_err(|e| format!("failed to run native python command: {e}"))?;

  let code = output.status.code().unwrap_or(-1);
  Ok((
    String::from_utf8_lossy(&output.stdout).to_string(),
    String::from_utf8_lossy(&output.stderr).to_string(),
    code,
    cmd_display,
  ))
}

#[tauri::command]
fn list_simulations() -> Vec<&'static str> {
  vec!["all", "geometry", "holographic", "complexity_compiler"]
}

#[tauri::command]
fn run_simulation(simulation: String, prefer_linux: bool) -> Result<SimulationOutput, String> {
  let script = simulation_script(&simulation)
    .ok_or_else(|| format!("unknown simulation '{simulation}'"))?;
  let root = repo_root();

  let run_result = if prefer_linux {
    match run_linux(script, &root) {
      Ok(result) => Ok(result),
      Err(linux_err) => {
        let native = run_native(script, &root)?;
        let combined_stderr = format!(
          "Linux run failed, fell back to native Python: {linux_err}\n\n{}",
          native.1
        );
        Ok((native.0, combined_stderr, native.2, native.3))
      }
    }
  } else {
    run_native(script, &root)
  }?;

  Ok(SimulationOutput {
    simulation,
    command: run_result.3,
    exit_code: run_result.2,
    success: run_result.2 == 0,
    stdout: run_result.0,
    stderr: run_result.1,
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![list_simulations, run_simulation])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
