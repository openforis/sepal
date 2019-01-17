package org.openforis.sepal.component.notification.adapter

import groovy.sql.GroovyResultSet
import groovy.sql.Sql
import org.openforis.sepal.component.notification.api.Message
import org.openforis.sepal.component.notification.api.MessageRepository
import org.openforis.sepal.component.notification.api.NotFound
import org.openforis.sepal.component.notification.api.Notification
import org.openforis.sepal.component.notification.api.NotificationRepository
import org.openforis.sepal.sql.SqlConnectionProvider
import org.openforis.sepal.util.Clock

import static org.openforis.sepal.component.notification.api.Notification.State.UNREAD

class JdbcNotificationRepository implements MessageRepository, NotificationRepository {
    private final SqlConnectionProvider connectionProvider
    private final Clock clock

    JdbcNotificationRepository(SqlConnectionProvider connectionProvider, Clock clock) {
        this.connectionProvider = connectionProvider
        this.clock = clock
    }

    Message getMessageById(String id) {
        def message = null
        sql.eachRow('''
            SELECT  id, username, subject, contents, type, creation_time, update_time
            FROM message 
            WHERE id = ? AND removed = false''', [id]) {
            message = toMessage(it)
        }
        if (!message)
            throw new NotFound("There exist no message with id $id")
        return message
    }

    Message saveMessage(Message message) {
        def updated = sql.executeUpdate('''
                UPDATE message 
                SET username = ?, subject = ?, contents = ?, type = ?, update_time = ?
                WHERE id = ?''', [message.username, message.subject, message.contents, message.type.name(), message.updateTime, message.id])
        if (!updated) {
            sql.executeInsert('''
                INSERT INTO message(id, username, subject, contents, type, creation_time, update_time)
                VALUES(?, ?, ?, ?, ?, ?, ?)''', [
                    message.id, message.username, message.subject, message.contents, message.type.name(), message.creationTime, message.updateTime
            ])
        }
        return getMessageById(message.id)
    }

    void removeMessage(String id) {
        def updated = sql.executeUpdate('''
                UPDATE message 
                SET removed = true
                WHERE id = ?''', [id])
    }

    List<Message> listMessages() {
        def messages = []
        sql.eachRow('''
                SELECT id, username, subject, contents, type, creation_time, update_time
                FROM message 
                WHERE NOT removed
                ORDER BY creation_time DESC''') {
            messages << toMessage(it)
        }
        return messages
    }

    void updateNotification(String username, String messageId, Notification.State state) {
        def updated = sql.executeUpdate('''
                UPDATE notification 
                SET state = ?
                WHERE username = ? AND message_id = ?''', [state.name(), username, messageId])
        if (!updated)
            sql.executeInsert('''
                INSERT INTO notification(username, message_id, state) 
                VALUES(?, ?, ?)''', [
                    username, messageId, state.name()
            ])
    }

    List<Notification> listNotifications(String username) {
        def notifications = []
        sql.eachRow('''
                SELECT m.id, m.username, m.subject, m.contents, m.type, m.creation_time, m.update_time, n.state
                FROM message m 
                LEFT OUTER JOIN notification n 
                    ON m.id = n.message_id AND (n.username = ? OR n.username IS NULL) 
                WHERE NOT m.removed
                ORDER BY m.creation_time DESC''', [username]) {
            notifications << new Notification(
                    message: toMessage(it),
                    username: username,
                    state: (it.state as Notification.State) ?: UNREAD
            )
        }
        return notifications
    }

    private Message toMessage(GroovyResultSet row) {
        new Message(
                id: row.id,
                username: row.username,
                subject: row.subject,
                contents: row.longText('contents'),
                type: row.type as Message.Type,
                creationTime: new Date(row.creation_time.time as long),
                updateTime: new Date(row.update_time.time as long)
        )
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
