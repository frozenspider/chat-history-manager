use std::path::PathBuf;

use cstr::cstr;
use qmetaobject::prelude::*;

mod my_object;

/// https://github.com/woboq/qmetaobject-rs/
pub fn start() {
    qmetaobject::log::init_qt_to_rust();

    // Register the `Hello` struct to QML
    qml_register_type::<my_object::Hello>(cstr!("demo"), 1, 0, cstr!("Hello"));

    let qml_path = PathBuf::from("./qml");

    // Create a QML engine from rust
    let mut engine = QmlEngine::new();

    for qml_file in qml_path.read_dir().expect("QML path not found!") {
        if let Ok(qml_file) = qml_file {
            engine.load_file(qml_file.path().as_os_str().to_str().expect("QML path not convertible to stirng!").into());
        }
    }
    engine.exec();
}
