package org.openforis.sepal.component.notification.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.notification.api.MessageRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class RemoveMessage extends AbstractCommand<Void> {
    String id
}

class RemoveMessageHandler implements CommandHandler<Void, RemoveMessage> {
    private final MessageRepository repository

    RemoveMessageHandler(MessageRepository repository) {
        this.repository = repository
    }

    Void execute(RemoveMessage command) {
        repository.removeMessage(command.id)
        return null
    }
}
