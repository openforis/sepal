package org.openforis.sepal.component.notification.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.notification.api.Message
import org.openforis.sepal.component.notification.api.MessageRepository
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class SaveMessage extends AbstractCommand<Void> {
    Message message
}

class SaveMessageHandler implements CommandHandler<Void, SaveMessage> {
    private final MessageRepository repository
    private final Clock clock

    SaveMessageHandler(MessageRepository repository, Clock clock) {
        this.repository = repository
        this.clock = clock
    }

    Void execute(SaveMessage command) {
        def message = command.message.creationTime ? command.message.updated(clock.now()) : command.message.created(clock.now())
        repository.saveMessage(message)
        return null
    }
}
