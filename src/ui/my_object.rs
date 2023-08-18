use qmetaobject::prelude::*;

#[derive(QObject, Default)]
pub struct Hello {
    base: qt_base_class!(trait QObject),

    name: qt_property!(QString),

    say_hello : qt_method!(fn say_hello(&self) {
        println!("Hello {}!", self.name)
    })
}
