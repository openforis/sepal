package org.openforis.sepal.component.task

import org.openforis.sepal.command.Command
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.sandboxmanager.JdbcSessionRepository
import org.openforis.sepal.component.sandboxmanager.SandboxSessionProvider
import org.openforis.sepal.component.task.command.SubmitTask
import org.openforis.sepal.component.task.command.SubmitTaskHandler
import org.openforis.sepal.component.task.query.ListTaskStatuses
import org.openforis.sepal.component.task.query.ListTaskStatusesHandler
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock

import javax.sql.DataSource

class TaskComponent {
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher
    private final SqlConnectionManager connectionManager
    private final WorkerInstanceManager instanceManager
    private final HandlerRegistryEventDispatcher eventDispatcher

    TaskComponent(
            DataSource dataSource,
            HostingService hostingService,
            SandboxSessionProvider sessionProvider,
            Clock clock) {
        connectionManager = new SqlConnectionManager(dataSource)
        this.instanceManager = hostingService.workerInstanceManager
        eventDispatcher = new HandlerRegistryEventDispatcher()
        def sessionRepository = new JdbcSessionRepository(connectionManager, clock)
        def taskManager = new TaskManager(sessionRepository, instanceManager, sessionProvider, eventDispatcher, clock)
        def taskRepository = new JdbcTaskRepository(connectionManager)

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(SubmitTask, new SubmitTaskHandler(taskRepository, taskManager))

        queryDispatcher = new HandlerRegistryQueryDispatcher()
                .register(ListTaskStatuses, new ListTaskStatusesHandler(taskRepository))
    }

    def <R> R submit(Command<R> command) {
        commandDispatcher.submit(command)
    }

    def <R> R submit(Query<R> query) {
        queryDispatcher.submit(query)
    }

    void stop() {
        connectionManager.close()
    }
}
