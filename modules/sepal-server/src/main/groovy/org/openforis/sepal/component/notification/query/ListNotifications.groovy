package org.openforis.sepal.component.notification.query

import org.openforis.sepal.component.notification.api.Notification
import org.openforis.sepal.component.notification.api.NotificationRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

@Data
class ListNotifications implements Query<List<Notification>> {
    String username
}

class ListNotificationsHandler implements QueryHandler<List<Notification>, ListNotifications> {
    private final NotificationRepository repository

    ListNotificationsHandler(NotificationRepository repository) {
        this.repository = repository
    }

    List<Notification> execute(ListNotifications query) {
        return repository.listNotifications(query.username)
    }
}
