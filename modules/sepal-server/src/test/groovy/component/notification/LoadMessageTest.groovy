package component.notification

class LoadMessageTest extends NotificationTest {
    def 'Loading a non-existing message throws'() {
        when:
        loadMessage('non-existing message')

        then:
        thrown Exception
    }
}
