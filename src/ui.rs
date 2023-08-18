slint::slint!{

import { Button, GroupBox, SpinBox, ComboBox, CheckBox, LineEdit, TabWidget, VerticalBox, HorizontalBox,
    Slider, ProgressIndicator, SpinBox, Switch, StandardButton } from "std-widgets.slint";

export component HelloWorld inherits Window {
    width: 400px;
    height: 400px;

    callback show_popup(string);

    VerticalBox {
        alignment: start;
        padding: 0px;

        Text {
           text: "Hello, world";
           color: blue;
        }

        Button {
            text: @tr("Say Hello!");
            enabled: true;

            clicked => {
                root.show_popup("World");
            }
        }
    }
}

}

slint::slint!{

import { Button, GroupBox, SpinBox, ComboBox, CheckBox, LineEdit, TabWidget, VerticalBox, HorizontalBox,
    Slider, ProgressIndicator, SpinBox, Switch, StandardButton } from "std-widgets.slint";

component Popup inherits Dialog {
    in property <string> name;

    Text {
      text: "Hello, " + name + "!";
    }
    StandardButton { kind: ok; }
    StandardButton { kind: cancel; }
}

}

/// https://github.com/slint-ui/slint
///
/// - LaF is different for different platforms!
/// - No help from IDE
///
/// + Has Dialog for popups
/// + Can embed OpenGL/ffmpeg
/// + Has a dynamic renderer for .slint files in cargo
/// + Can use Qt backend
///
pub fn start() {
    let app = HelloWorld::new().unwrap();
    let popup = Popup::new().unwrap();
    let weak_popup = popup.as_weak();

    app.on_show_popup(move |name| {
        println!("Hello, {name}!");
        weak_popup.unwrap().set_name(name);
        weak_popup.unwrap().show().unwrap();
    });

    app.run().unwrap();
}
