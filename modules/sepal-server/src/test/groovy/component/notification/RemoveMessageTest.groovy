package component.notification

class RemoveMessageTest extends NotificationTest {
    def 'When removing, it can not be loaded'() {
        def message = createMessage()
        saveMessage(message)

        when:
        removeMessage(message.id)

        then:
        listMessages().empty
    }

}
