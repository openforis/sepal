package org.openforis.sepal.component.task

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.task.adapter.JdbcTaskRepository
import org.openforis.sepal.component.task.adapter.SessionComponentAdapter
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.endpoint.TaskEndpoint
import org.openforis.sepal.component.task.query.UserTasks
import org.openforis.sepal.component.task.query.UserTasksHandler
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import static java.util.concurrent.TimeUnit.SECONDS

class TaskComponent extends DataSourceBackedComponent implements EndpointRegistry {
    TaskComponent(
            WorkerSessionComponent workerSessionComponent,
            WorkerGateway workerGateway,
            SqlConnectionManager connectionManager) {
        this(
                connectionManager,
                new AsynchronousEventDispatcher(),
                new SessionComponentAdapter(workerSessionComponent),
                workerGateway,
                new SystemClock()
        )
    }

    TaskComponent(
            SqlConnectionManager connectionManager,
            HandlerRegistryEventDispatcher eventDispatcher,
            WorkerSessionManager sessionManager,
            WorkerGateway workerGateway,
            Clock clock) {
        super(connectionManager, eventDispatcher)
        def taskRepository = new JdbcTaskRepository(connectionManager, clock)

        command(SubmitTask, new SubmitTaskHandler(taskRepository, sessionManager, workerGateway, clock))
        command(ResubmitTask, new ResubmitTaskHandler(taskRepository, sessionManager, workerGateway, clock))
        command(ExecuteTasksInSession, new ExecuteTasksInSessionHandler(taskRepository, sessionManager, workerGateway))
        command(CancelTask, new CancelTaskHandler(taskRepository, sessionManager, workerGateway))
        command(CancelTimedOutTasks, new CancelTimedOutTasksHandler(taskRepository, sessionManager, workerGateway))
        command(CancelUserTasks, new CancelUserTasksHandler(taskRepository, sessionManager, workerGateway))
        command(UpdateTaskProgress, new UpdateTaskProgressHandler(taskRepository, sessionManager))
        command(RemoveTask, new RemoveTaskHandler(taskRepository))
        command(RemoveUserTasks, new RemoveUserTasksHandler(taskRepository))
        command(FailTasksInSession, new FailTasksInSessionHandler(taskRepository))

        query(UserTasks, new UserTasksHandler(taskRepository))

        sessionManager
                .onSessionActivated { submit(new ExecuteTasksInSession(session: it)) }
                .onSessionClosed { submit(new FailTasksInSession(sessionId: it)) }
    }

    void registerEndpointsWith(Controller controller) {
        new TaskEndpoint(this).registerWith(controller)
    }

    void onStart() {
        schedule(10, SECONDS, new CancelTimedOutTasks())
    }
}
