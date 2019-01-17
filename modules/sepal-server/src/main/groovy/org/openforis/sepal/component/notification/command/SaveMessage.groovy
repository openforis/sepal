package org.openforis.sepal.component.notification.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.notification.api.Message
import org.openforis.sepal.component.notification.api.MessageRepository
import org.openforis.sepal.util.Clock

@EqualsAndHashCode(callSuper = true)
@Canonical
class SaveMessage extends AbstractCommand<Message> {
    Message message
}

class SaveMessageHandler implements CommandHandler<Message, SaveMessage> {
    private final MessageRepository repository
    private final Clock clock

    SaveMessageHandler(MessageRepository repository, Clock clock) {
        this.repository = repository
        this.clock = clock
    }

    Message execute(SaveMessage command) {
        def now = clock.now()
        def message = command.message
            .updated(now)
        return repository.saveMessage(message)
    }
}
