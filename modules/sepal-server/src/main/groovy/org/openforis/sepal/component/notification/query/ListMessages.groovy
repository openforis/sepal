package org.openforis.sepal.component.notification.query

import org.openforis.sepal.component.notification.api.Message
import org.openforis.sepal.component.notification.api.MessageRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

@Data
class ListMessages implements Query<List<Message>> {
}

class ListMessagesHandler implements QueryHandler<List<Message>, ListMessages> {
    private final MessageRepository repository

    ListMessagesHandler(MessageRepository repository) {
        this.repository = repository
    }

    List<Message> execute(ListMessages query) {
        return repository.listMessages()
    }
}
