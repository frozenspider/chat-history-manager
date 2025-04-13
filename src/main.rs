use std::future::Future;

use clap::{Parser, Subcommand};
use deepsize::DeepSizeOf;
use log::LevelFilter;
use mimalloc::MiMalloc;
use tokio::runtime::Handle;

use chat_history_manager_backend::prelude::*;
use chat_history_manager_backend::{debug_request_myself, parse_file, start_server, start_user_input_server};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Parser)]
#[command(version, about, long_about = None)]
struct Args {
    /// Port to start gRPC server on, defaults to 50051.
    /// Next port will be used for the user info request server.
    port: Option<u16>,

    #[command(subcommand)]
    command: Option<Command>,
}

const DEFAULT_SERVER_PORT: u16 = 50051;

#[derive(Subcommand, Debug)]
enum Command {
    /// Start a gRPC server on the given port
    StartServer,
    /// (For debugging purposes only) Parse and load a given file using whichever loader is appropriate,
    /// and print the result in-memory DB size to the log
    Parse {
        path: String,
        myself_id: Option<i64>,
    },
    /// (For debugging purposes only) Ask UI which user is "myself" and print it to the log
    RequestMyself,
}

/** Starts a server by default. */
#[tokio::main(flavor = "multi_thread", worker_threads = 10)]
async fn main() {
    init_logger();

    let args = Args::parse();
    catch_fatal_error(execute_command(args.command, args.port).await)
}

async fn execute_command(command: Option<Command>, port: Option<u16>) -> EmptyRes {
    let port = port.unwrap_or(DEFAULT_SERVER_PORT);
    let remote_port = port + 1;
    match command {
        None => {
            if cfg!(not(feature = "ui-core")) {
                bail!("UI is disabled, specify a command to run instead");
            }
            #[cfg(feature = "ui-core")]
            {
                if port != DEFAULT_SERVER_PORT {
                    bail!("Port must be {} when running the UI", DEFAULT_SERVER_PORT);
                }
                let handle = Handle::current();
                // Start a server if not already running
                spawn_server(&handle, "Server", port, async move {
                    start_server(port, remote_port).await
                });
                let clients = client::create_clients(port).await?;
                let ui = chat_history_manager_ui::create_ui(clients, port);
                let ui_clone = ui.clone();
                spawn_server(&handle, "User input server", remote_port, async move {
                    let requester = ui_clone.listen_for_user_input().await?;
                    start_user_input_server(remote_port, requester).await
                });
                ui.start_and_block()
            }
        }
        Some(Command::StartServer) => {
            start_server(port, remote_port).await?;
        }
        Some(Command::Parse { path, myself_id }) => {
            let handle = Handle::current();
            let join_handle = handle.spawn_blocking(move || {
                let chooser: Box<dyn UserInputBlockingRequester> =
                    if let Some(myself_id) = myself_id {
                        Box::new(client::PredefinedInput {
                            myself_id: Some(myself_id),
                            text: None,
                        })
                    } else {
                        Box::new(NoChooser)
                    };
                parse_file(&path, chooser.as_ref()).with_context(|| format!("Failed to parse {path}"))
            });
            let parsed = join_handle.await??;
            let size: usize = parsed.deep_size_of();
            log::info!(
                "Size of parsed in-memory DB: {} MB ({} B)",
                size / 1024 / 1024,
                size
            );
        }
        Some(Command::RequestMyself) => {
            let chosen = debug_request_myself(port).await?;
            log::info!("Picked: {}", chosen);
        }
    }
    Ok(())
}

fn init_logger() {
    env_logger::Builder::new()
        .filter(None, LevelFilter::Debug)
        .format(|buf, record| {
            use std::io::Write;

            let timestamp = buf.timestamp_millis();
            let level = record.level();
            let target = record.target();

            let thread = std::thread::current();
            writeln!(
                buf,
                "{} {: <5} {} - {} [{}]",
                timestamp,
                level,
                target,
                record.args(),
                thread.name().unwrap_or("<unnamed>")
            )
        })
        .init();
}

fn spawn_server(handle: &Handle, server_name: &str, port: u16, call: impl Future<Output = EmptyRes> + Send + 'static) {
    let server_name = server_name.to_owned();
    handle.spawn(async move {
        match call.await {
            Err(e) if e.root_cause().downcast_ref::<std::io::Error>()
                .filter(|e| e.kind() == std::io::ErrorKind::AddrInUse)
                .is_some() => {
                log::warn!("{server_name} already running on port {port}")
            }
            e => catch_fatal_error(e)
        }
    });
}

fn catch_fatal_error<T>(v: Result<T>) -> T {
    match v {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error: {}", error_message(&e));
            let backtrace = e.backtrace();
            // Backtrace is defined as just "&impl Debug + Display", so to make sure we actually have a backtrace
            // we have to use a rather dirty workaround - if backtrace is not available, its string representation
            // will be just one line like "disabled backtrace" or "unsupported backtrace".
            // See anyhow::backtrace::capture::<impl Display for Backtrace>
            let backtrace = backtrace.to_string();
            if backtrace.contains('\n') {
                eprintln!();
                eprintln!("Stack trace:\n{}", e.backtrace());
            }
            std::process::exit(1);
        }
    }
}
