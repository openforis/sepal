package component.notification

class ListMessagesTest extends NotificationTest {
    def 'Saved messages are listed with latest first'() {
        def message1 = createMessage(id: 'message 1')
        def message2 = createMessage(id: 'message 2')
        saveMessage(message1)
        saveMessage(message2)

        when:
        def messages = listMessages()

        then:
        messages.toSet() == [message2, message1].toSet()
    }
}
