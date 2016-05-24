package org.openforis.sepal.component.task

import org.openforis.sepal.command.Command
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.event.TaskExecutorProvisioned
import org.openforis.sepal.component.task.event.TaskExecutorStarted
import org.openforis.sepal.component.task.query.ListTaskStatuses
import org.openforis.sepal.component.task.query.ListTaskStatusesHandler
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock

import javax.sql.DataSource

final class TaskComponent {
    private final SqlConnectionManager connectionManager
    private final HandlerRegistryEventDispatcher eventDispatcher
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher

    TaskComponent(
            DataSource dataSource,
            InstanceProvider instanceProvider,
            InstanceProvisioner instanceProvisioner,
            TaskExecutorGateway taskExecutorGateway,
            HandlerRegistryEventDispatcher eventDispatcher,
            Clock clock) {
        connectionManager = new SqlConnectionManager(dataSource)
        this.eventDispatcher = eventDispatcher

        def taskRepository = new JdbcTaskRepository(connectionManager)

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(SubmitTask, new SubmitTaskHandler(taskRepository, instanceProvider, eventDispatcher))
                .register(CancelTask, new CancelTaskHandler(taskRepository, instanceProvider, eventDispatcher))
                .register(ProvisionTaskExecutor, new ProvisionTaskExecutorHandler(taskRepository, instanceProvisioner))
                .register(SubmitTasksToTaskExecutor, new SubmitTasksToTaskExecutorHandler(taskRepository, instanceProvider, taskExecutorGateway))

        queryDispatcher = new HandlerRegistryQueryDispatcher()
                .register(ListTaskStatuses, new ListTaskStatusesHandler(taskRepository))

        eventDispatcher
                .register(TaskExecutorStarted) { submit(new ProvisionTaskExecutor(instance: it.instance)) }
                .register(TaskExecutorProvisioned) { submit(new SubmitTasksToTaskExecutor(instance: it.instance)) }
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
