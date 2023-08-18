#![allow(unused_imports)]
use std::{env, fs, path::PathBuf};
use cxx_qt_build::CxxQtBuilder;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let curr_dir = env::current_dir().unwrap_or_else(|e| panic!("current directory is inaccessible: {}", e));

    let proto_files = vec!["./protobuf/history.proto"];
    let fd_out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let pb_out_dir = curr_dir.join("src/protobuf");

    if !pb_out_dir.exists() {
        fs::create_dir(&pb_out_dir).unwrap_or_else(|e| panic!("cannot create directory {:?}: {}", pb_out_dir, e));
    }

    tonic_build::configure()
        .build_server(true)
        .file_descriptor_set_path(fd_out_dir.join("grpc_reflection_descriptor.bin"))
        .out_dir(pb_out_dir)
        .type_attribute(".", "#[derive(deepsize::DeepSizeOf)]")
        .compile(&proto_files, &["."])
        .unwrap_or_else(|e| panic!("protobuf compile error: {}", e));

    for proto_file in proto_files {
        println!("cargo:rerun-if-changed={}", proto_file);
    }

    CxxQtBuilder::new()
        // Link Qt's Network library
        // - Qt Core is always linked
        // - Qt Gui is linked by enabling the qt_gui Cargo feature (default).
        // - Qt Qml is linked by enabling the qt_qml Cargo feature (default).
        // - Qt Qml requires linking Qt Network on macOS
        .qt_module("Network")
        // Generate C++ from the `#[cxx_qt::bridge]` module
        .file("src/ui/my_object.rs")
        // Generate C++ code from the .qrc file with the rcc tool
        // https://doc.qt.io/qt-6/resources.html
        .qrc("qml/qml.qrc")
        .setup_linker()
        .build();

    Ok(())
}
