use std::process;

use clap::{Parser, Subcommand};
use deepsize::DeepSizeOf;
use log::LevelFilter;
use mimalloc::MiMalloc;
use tokio::runtime::Handle;

use chat_history_manager_backend::prelude::*;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Parser)]
#[command(version, about, long_about = None)]
struct Args {
    #[command(subcommand)]
    command: Command,
}

const DEFAULT_SERVER_PORT: u16 = 50051;

#[derive(Subcommand, Debug)]
enum Command {
    /// Start a gRPC server on the given port (defaults to 50051)
    StartServer { server_port: Option<u16> },
    /// (For debugging purposes only) Parse and load a given file using whichever loader is appropriate,
    /// and print the result in-memory DB size to the log
    Parse { path: String },
    /// (For debugging purposes only) Ask UI which user is "myself" and print it to the log
    RequestMyself { port: Option<u16> },
}

/** Starts a server by default. */
#[tokio::main(flavor = "multi_thread", worker_threads = 10)]
async fn main() {
    init_logger();

    let args = Args::parse();
    if let Err(e) = execute_command(args.command).await {
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
        process::exit(1);
    }
}

async fn execute_command(command: Command) -> EmptyRes {
    match command {
        Command::StartServer { server_port } => {
            let server_port = server_port.unwrap_or(DEFAULT_SERVER_PORT);
            start_server(server_port).await?;
        }
        Command::Parse { path } => {
            let handle = Handle::current();
            let join_handle = handle.spawn_blocking(move || {
                parse_file(&path, &client::NoChooser).with_context(|| format!("Failed to parse {path}"))
            });
            let parsed = join_handle.await??;
            let size: usize = parsed.deep_size_of();
            log::info!("Size of parsed in-memory DB: {} MB ({} B)", size / 1024 / 1024, size);
        }
        Command::RequestMyself { port } => {
            let port = port.unwrap_or(DEFAULT_SERVER_PORT + 1);
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
            writeln!(buf, "{} {: <5} {} - {} [{}]",
                     timestamp, level, target, record.args(),
                     thread.name().unwrap_or("<unnamed>"))
        })
        .init();
}
