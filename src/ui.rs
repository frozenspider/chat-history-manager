// import the prelude to get access to the `rsx!` macro and the `Scope` and `Element` types
use dioxus::prelude::*;

fn button_clicked() {
    println!("Hello, World!")
}

// define a component that renders a div with the text "Hello, world!"
fn app(cxt: Scope) -> Element {
    let content = rsx! {
        div {
            "Hello, world!"
        }
        button {
            onclick: move |_| button_clicked(),
            "Say hello!"
        }
    };
    cxt.render(content)
}

/// https://github.com/DioxusLabs/dioxus
///
/// ? Built on Tauri, Webview based
///
/// - Have to use Tauri directly for keyboard shortcuts, menu bar
/// - JS
///
/// + Hot reloads
pub fn start() {
    // launch the dioxus app in a webview
    dioxus_desktop::launch(app);
}
