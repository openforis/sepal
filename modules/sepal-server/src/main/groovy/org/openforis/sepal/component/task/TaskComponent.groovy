package org.openforis.sepal.component.task

import org.openforis.sepal.command.Command
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.event.TaskCanceled
import org.openforis.sepal.component.task.event.TaskExecutorProvisioned
import org.openforis.sepal.component.task.event.TaskExecutorStarted
import org.openforis.sepal.component.task.event.TasksTimedOut
import org.openforis.sepal.component.task.query.ListTaskTasks
import org.openforis.sepal.component.task.query.ListTasksHandler
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.EventHandler
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

        def taskRepository = new JdbcTaskRepository(connectionManager, clock)

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(SubmitTask, new SubmitTaskHandler(taskRepository, instanceProvider, taskExecutorGateway, eventDispatcher))
                .register(CancelTask, new CancelTaskHandler(taskRepository, instanceProvider, taskExecutorGateway))
                .register(ProvisionTaskExecutor, new ProvisionTaskExecutorHandler(taskRepository, instanceProvisioner))
                .register(ActivateInstance, new ActivateInstanceHandler(instanceProvider))
                .register(ExecutePendingTasks, new ExecutePendingTasksHandler(taskRepository, instanceProvider, taskExecutorGateway))
                .register(ReleasedUnusedInstances, new ReleasedUnusedInstancesHandler(taskRepository, instanceProvider, instanceProvisioner))
                .register(HandleTimedOutTasks, new HandleTimedOutTasksHandler(taskRepository, eventDispatcher))

        queryDispatcher = new HandlerRegistryQueryDispatcher()
                .register(ListTaskTasks, new ListTasksHandler(taskRepository))

        eventDispatcher
                .register(TaskExecutorStarted) { submit(new ProvisionTaskExecutor(instance: it.instance)) }
                .register(TaskCanceled) { submit(new ReleasedUnusedInstances()) }
                .register(TasksTimedOut) { submit(new ReleasedUnusedInstances()) }
                .register(TaskExecutorProvisioned, {
            submit(new ActivateInstance(instance: it.instance))
            submit(new ExecutePendingTasks())
        })
    }

    def <R> R submit(Command<R> command) {
        commandDispatcher.submit(command)
    }

    def <R> R submit(Query<R> query) {
        queryDispatcher.submit(query)
    }

    def <E extends Event> TaskComponent register(Class<E> eventType, EventHandler<E> handler) {
        eventDispatcher.register(eventType, handler)
        return this
    }


    void stop() {
        connectionManager.close()
    }
}
