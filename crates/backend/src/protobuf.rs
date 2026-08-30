pub mod history {
    // Entity types live in the core crate; this crate only generates the service types that
    // refer to them. Was previously prepended to the generated file by the build script.
    pub use chat_history_manager_core::protobuf::history::*;

    include!(concat!(env!("OUT_DIR"), "/history.rs"));
}
