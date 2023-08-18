use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};

mod my_object;

/// https://github.com/KDAB/cxx-qt
pub fn start() {
    // Create the application and engine
    let mut app = QGuiApplication::new();
    let mut engine = QQmlApplicationEngine::new();

    // Load the QML path into the engine
    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from("qrc:/main.qml"));
    }

    // Start the app
    if let Some(app) = app.as_mut() {
        app.exec();
    }
}
