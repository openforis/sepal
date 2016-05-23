package org.openforis.sepal.component.task

import org.openforis.sepal.command.Command
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.task.command.CancelTask
import org.openforis.sepal.component.task.command.CancelTaskHandler
import org.openforis.sepal.component.task.command.SubmitTask
import org.openforis.sepal.component.task.command.SubmitTaskHandler
import org.openforis.sepal.component.task.query.ListTaskStatuses
import org.openforis.sepal.component.task.query.ListTaskStatusesHandler
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock

import javax.sql.DataSource

class TaskComponent {
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher
    private final SqlConnectionManager connectionManager

    TaskComponent(
            DataSource dataSource,
            InstanceProvider instanceProvider,
            Clock clock) {
        connectionManager = new SqlConnectionManager(dataSource)
        def taskRepository = new JdbcTaskRepository(connectionManager)
        def taskManager = new TaskManager(taskRepository, instanceProvider, clock)

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(SubmitTask, new SubmitTaskHandler(taskManager))
                .register(CancelTask, new CancelTaskHandler(taskManager))

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
