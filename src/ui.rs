use iced::{Alignment, Element, Sandbox, Settings};

mod my_object;

/// https://github.com/iced-rs/iced
///
/// No idea how to make a popup dialog, seems complicated
pub fn start() {
    let result = my_object::Counter::run(Settings::default());
    result.unwrap();
}
