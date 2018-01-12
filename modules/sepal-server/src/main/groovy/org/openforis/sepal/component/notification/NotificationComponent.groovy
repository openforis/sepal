package org.openforis.sepal.component.notification

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.notification.adapter.JdbcNotificationRepository
import org.openforis.sepal.component.notification.command.*
import org.openforis.sepal.component.notification.endpoint.NotificationEndpoint
import org.openforis.sepal.component.notification.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.DatabaseConfig
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

class NotificationComponent extends DataSourceBackedComponent implements EndpointRegistry {
    static final String SCHEMA = 'notification'

    static NotificationComponent create() {
        def connectionManager = SqlConnectionManager.create(DatabaseConfig.fromPropertiesFile(SCHEMA))
        return new NotificationComponent(
                connectionManager,
                new AsynchronousEventDispatcher(),
                new SystemClock())
    }

    NotificationComponent(
            SqlConnectionManager connectionManager,
            HandlerRegistryEventDispatcher eventDispatcher,
            Clock clock
    ) {
        super(connectionManager, eventDispatcher)
        def repository = new JdbcNotificationRepository(connectionManager)

        command(SaveMessage, new SaveMessageHandler(repository, clock))
        command(RemoveMessage, new RemoveMessageHandler(repository))
        command(UpdateNotification, new UpdateNotificationHandler(repository))

        query(LoadMessage, new LoadMessageHandler(repository))
        query(ListMessages, new ListMessagesHandler(repository))
        query(ListNotifications, new ListNotificationsHandler(repository))

    }

    void registerEndpointsWith(Controller controller) {
        new NotificationEndpoint(this).registerWith(controller)
    }
}
