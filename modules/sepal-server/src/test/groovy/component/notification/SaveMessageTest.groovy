package component.notification

class SaveMessageTest extends NotificationTest {
    def 'When saving, it can be loaded'() {
        def message = createMessage()

        when:
        saveMessage(message)

        then:
        loadMessage(message.id) == message
    }

}
