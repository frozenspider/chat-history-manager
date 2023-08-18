#[cxx_qt::bridge]
mod my_object {

    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    #[cxx_qt::qobject(qml_uri = "demo", qml_version = "1.0")]
    #[derive(Default)]
    pub struct Hello {
        #[qproperty]
        name: QString
    }

    impl qobject::Hello {
        #[qinvokable]
        pub fn say_hello(&self) {
            println!("Hello {}!", self.name())
        }
    }
}
