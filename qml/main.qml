import QtQuick.Controls 2.12
import QtQuick.Window 2.12

// This must match the uri, version_major and version_minor specified with qml_register_type.
import demo 1.0

Window {
    title: qsTr("Hello App")
    visible: true
    height: 480
    width: 640
    color: "#e4af79"

    Hello {
        id: hello
        // Set a property
        name: "My World"
    }

    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
        // Space between widget
        spacing: 10

        Button {
            text: "Say Hello!"
            onClicked: hello.say_hello()
        }
    }
}
