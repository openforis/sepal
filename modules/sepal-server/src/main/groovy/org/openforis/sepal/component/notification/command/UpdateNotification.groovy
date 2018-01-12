package org.openforis.sepal.component.notification.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.notification.api.MessageRepository
import org.openforis.sepal.component.notification.api.Notification
import org.openforis.sepal.component.notification.api.NotificationRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class UpdateNotification  extends AbstractCommand<Void> {
    String messageId
    Notification.State state
}

class UpdateNotificationHandler implements CommandHandler<Void, UpdateNotification> {
    private final NotificationRepository repository

    UpdateNotificationHandler(NotificationRepository repository) {
        this.repository = repository
    }

    Void execute(UpdateNotification command) {
        repository.updateNotification(command.username, command.messageId, command.state)
        return null
    }

}