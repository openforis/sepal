package org.openforis.sepal.component.notification.query

import groovy.transform.Canonical
import org.openforis.sepal.component.notification.api.Message
import org.openforis.sepal.component.notification.api.MessageRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Canonical
class LoadMessage implements Query<Message> {
    String id
}

class LoadMessageHandler implements QueryHandler<Message, LoadMessage> {
    private final MessageRepository repository

    LoadMessageHandler(MessageRepository repository) {
        this.repository = repository
    }

    Message execute(LoadMessage query) throws IllegalStateException {
        return repository.getMessageById(query.id)
    }
}
