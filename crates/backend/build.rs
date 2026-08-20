#![allow(unused_imports)]
use std::{env, fs, path::PathBuf};
use anyhow::Context;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::new()
        .filter(None, log::LevelFilter::Debug)
        .init();

    // tonic emits the `cargo:rerun-if-changed`, but only does the right thing given
    // absolute paths and narrow include directories
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let proto_dir = manifest_dir.join("protobuf");
    let core_proto_dir = manifest_dir.join("../core/protobuf");
    let proto_files = vec![proto_dir.join("services.proto")];
    let proto_includes = vec![proto_dir, core_proto_dir];

    let fd_out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let descriptor_path = fd_out_dir.join("grpc_reflection_descriptor.bin");
    let discarded_out_dir = fd_out_dir.join("fds-pass-discarded");
    fs::create_dir_all(&discarded_out_dir)?;

    // We cannot avoid --include_imports flag, see https://github.com/tokio-rs/prost/issues/880
    // As a workaround, we compile file descriptors set (FDS) separately, edit it, and only then compile Rust code.
    // Note that this does double work - FDS are compiled into Rust files twice!
    //
    // Generated code lands in OUT_DIR and is pulled into the crate by `src/protobuf.rs`, which
    // also re-exports the entity types this crate's services refer to. Emitting it into `src/`
    // instead would make this build script dirty its own crate's sources on every run.
    let builder = tonic_build::configure()
        .build_server(true)
        .file_descriptor_set_path(descriptor_path.clone())
        .type_attribute(".", "#[derive(deepsize::DeepSizeOf)]");

    // Only the FDS is wanted from this pass; its Rust output is thrown away. Pointing it at a
    // scratch directory keeps it from clobbering the real `history.rs`, which lets prost-build's
    // write-only-if-changed check actually hold for the second pass.
    builder
        .clone()
        .out_dir(&discarded_out_dir)
        .compile(&proto_files, &proto_includes)
        .context("protobuf (.proto -> FDS) compile error")?;

    // Remove undesired file descriptors. Descriptor names are proto paths as protoc canonicalized
    // them, i.e. relative to the include directory they were found in.
    use prost::Message;
    let proto_names = proto_files.iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    let descriptor_bytes = fs::read(&descriptor_path).unwrap();
    let mut descriptor = prost_types::FileDescriptorSet::decode(&descriptor_bytes[..]).unwrap();
    descriptor.file.retain(|x| proto_names.iter().any(|name| name == x.name()));
    fs::write(&descriptor_path, descriptor.encode_to_vec())?;

    // This pass is fed the descriptor set living in OUT_DIR - a file this very script writes - so
    // tonic's emission has to stay off here, or the build script would watch its own output.
    builder
        .skip_protoc_run()
        .emit_rerun_if_changed(false)
        .compile(&[&descriptor_path], &proto_includes)
        .context("protobuf (FDS -> Rust) compile error")?;

    Ok(())
}
