package component.notification

import org.openforis.sepal.component.notification.api.Notification

import static org.openforis.sepal.component.notification.api.Notification.State.READ
import static org.openforis.sepal.component.notification.api.Notification.State.UNREAD

class ListNotificationsTest extends NotificationTest {
    def 'No saved messages give an empty list'() {
        when:
        def notifications = listNotifications(testUser)

        then:
        notifications.empty
    }

    def 'An saved message is returned'() {
        def message = createMessage()
        saveMessage(message)

        when:
        def notifications = listNotifications(testUser)

        then:
        oneNotification(notifications,
                new Notification(
                        message: message,
                        username: testUser,
                        state: UNREAD
                ))
    }

    def 'A read message is returned as read'() {
        def message = createMessage()
        saveMessage(message)
        updateNotification(message, testUser, READ)

        when:
        def notifications = listNotifications(testUser)

        then:
        oneNotification(notifications,
                new Notification(
                        message: message,
                        username: testUser,
                        state: READ
                ))
    }

    def 'Users can have different state for the same message'() {
        def message = createMessage()
        saveMessage(message)
        updateNotification(message, testUser, READ)

        when:
        def notifications1 = listNotifications(testUser)
        def notifications2 = listNotifications('another user')

        then:
        notifications1.first().state == READ
        notifications2.first().state == UNREAD
    }

    private void oneNotification(List<Notification> notifications, Notification expectedNotification) {
        assert notifications.size() == 1
        def notification = notifications.first()
        assert notification == expectedNotification
    }
}
