use iced::widget::{button, column, text, Column};
use iced::{Alignment, Element, Sandbox, Settings};

#[derive(Debug, Clone, Copy)]
pub enum CounterEvent {
    IncrementPressed,
    DecrementPressed,
}

pub struct Counter {
    // The counter value
    value: i32,
}

impl Sandbox for Counter {
    type Message = CounterEvent;

    fn new() -> Self {
        Self { value: 0 }
    }

    fn title(&self) -> String {
        String::from("Counter - Iced")
    }

    fn view(&self) -> Element<CounterEvent> {
        // We use a column: a simple vertical layout
        column![
            // The increment button. We tell it to produce an
            // `IncrementPressed` message when pressed
            button("INC").on_press(CounterEvent::IncrementPressed),

            // We show the value of the counter here
            text(self.value).size(50),

            // The decrement button. We tell it to produce a
            // `DecrementPressed` message when pressed
            button("DEC").on_press(CounterEvent::DecrementPressed),
        ]
        .padding(20)
        .align_items(Alignment::Center)
        .into()
    }

    fn update(&mut self, message: CounterEvent) {
        match message {
            CounterEvent::IncrementPressed => {
                self.value += 1;
            }
            CounterEvent::DecrementPressed => {
                self.value -= 1;
            }
        }
    }
}
