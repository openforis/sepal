package component.notification

import fake.Database
import fake.FakeClock
import org.openforis.sepal.component.notification.NotificationComponent
import org.openforis.sepal.component.notification.api.Message
import org.openforis.sepal.component.notification.api.Notification
import org.openforis.sepal.component.notification.command.RemoveMessage
import org.openforis.sepal.component.notification.command.SaveMessage
import org.openforis.sepal.component.notification.command.UpdateNotification
import org.openforis.sepal.component.notification.query.ListMessages
import org.openforis.sepal.component.notification.query.ListNotifications
import org.openforis.sepal.component.notification.query.LoadMessage
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import spock.lang.Specification

class NotificationTest extends Specification {
    final database = new Database(NotificationComponent.SCHEMA)
    final eventDispatcher = new SynchronousEventDispatcher()
    final connectionManager = new SqlConnectionManager(database.dataSource)
    final clock = new FakeClock()
    final testUser = 'testUser'

    def component = new NotificationComponent(connectionManager, eventDispatcher, clock)

    void updateNotification(Message message, String username, Notification.State state) {
        component.submit(new UpdateNotification(username: username, messageId: message.id, state: state))
    }

    void saveMessage(Message message) {
        component.submit(new SaveMessage(username: testUser, message: message))
    }

    void removeMessage(String id) {
        component.submit(new RemoveMessage(id: id))
    }

    Message loadMessage(String id) {
        component.submit(new LoadMessage(id: id))
    }

    List<Message> listMessages() {
        component.submit(new ListMessages())
    }

    List<Notification> listNotifications(String username) {
        component.submit(new ListNotifications(username: username))
    }

    Message createMessage(Map args = [:]) {
        clock.set(new Date(0))
        new Message(
                id: args.id ?: 'test message',
                subject: args.subject ?: 'test subject',
                contents: args.contents ?: 'test contents',
                username: args.username ?: 'test username',
                type: args.type ?: Message.Type.SYSTEM,
                creationTime: clock.now(),
                updateTime: clock.now()
        )
    }

}
