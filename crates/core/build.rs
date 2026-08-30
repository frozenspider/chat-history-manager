#![allow(unused_imports)]
use std::{env, path::PathBuf};
use anyhow::Context;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::new()
        .filter(None, log::LevelFilter::Debug)
        .init();

    // tonic emits the `cargo:rerun-if-changed`, but only does the right thing given
    // absolute paths and narrow include directories
    let proto_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("protobuf");
    let proto_files = vec![proto_dir.join("entities.proto")];
    let proto_includes = vec![proto_dir];

    let descriptor_path =
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("grpc_reflection_descriptor.bin");

    // Generated code lands in OUT_DIR and is pulled into the crate by `src/protobuf.rs`.
    // Emitting it into `src/` instead would make this build script dirty its own crate's
    // sources on every run, forcing a spurious recompile of everything downstream.
    tonic_build::configure()
        .build_server(true)
        .file_descriptor_set_path(descriptor_path)
        .type_attribute(".", "#[derive(deepsize::DeepSizeOf, serde::Serialize, serde::Deserialize)]")
        .enum_attribute(".", r#"#[serde(rename_all = "snake_case")]"#)
        // All oneof fields should be marked with #[serde(flatten)]
        .field_attribute("Message.typed", r#"#[serde(flatten)]"#)
        .field_attribute("RichTextElement.val", r#"#[serde(flatten)]"#)
        .field_attribute("sealed_value_optional", r#"#[serde(flatten)]"#)
        .compile(&proto_files, &proto_includes)
        .context("protobuf compile error")?;

    Ok(())
}
