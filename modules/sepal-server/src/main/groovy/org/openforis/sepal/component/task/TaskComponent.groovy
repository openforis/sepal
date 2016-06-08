package org.openforis.sepal.component.task

import groovymvc.Controller
import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.task.adapter.HttpWorkerGateway
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
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import javax.sql.DataSource

import static java.util.concurrent.TimeUnit.SECONDS

class TaskComponent extends AbstractComponent implements EndpointRegistry {
    TaskComponent(WorkerSessionComponent workerSessionComponent, DataSource dataSource) {
        this(
                dataSource,
                new AsynchronousEventDispatcher(),
                new SessionComponentAdapter(workerSessionComponent),
                new HttpWorkerGateway(),
                new SystemClock()
        )
    }

    TaskComponent(
            DataSource dataSource,
            HandlerRegistryEventDispatcher eventDispatcher,
            WorkerSessionManager sessionManager,
            WorkerGateway workerGateway,
            Clock clock) {
        super(dataSource, eventDispatcher)
        def connectionManager = new SqlConnectionManager(dataSource)
        def taskRepository = new JdbcTaskRepository(connectionManager, clock)

        command(SubmitTask, new SubmitTaskHandler(taskRepository, sessionManager, workerGateway, clock))
        command(ResubmitTask, new ResubmitTaskHandler(taskRepository, sessionManager, workerGateway, clock))
        command(ExecuteTasksInSession, new ExecuteTasksInSessionHandler(taskRepository, workerGateway))
        command(CancelTask, new CancelTaskHandler(taskRepository, sessionManager, workerGateway))
        command(CancelTimedOutTasks, new CancelTimedOutTasksHandler(taskRepository, sessionManager, workerGateway))
        command(CancelUserTasks, new CancelUserTasksHandler(taskRepository, sessionManager, workerGateway))
        command(UpdateTaskProgress, new UpdateTaskProgressHandler(taskRepository, sessionManager))
        command(RemoveTask, new RemoveTaskHandler(taskRepository))
        command(RemoveUserTasks, new RemoveUserTasksHandler(taskRepository))

        query(UserTasks, new UserTasksHandler(taskRepository))

        sessionManager.onSessionActivated { submit(new ExecuteTasksInSession(session: it)) }
    }

    void registerEndpointsWith(Controller controller) {
        new TaskEndpoint(this).registerWith(controller)
    }

    void onStart() {
        schedule(10, SECONDS, new CancelTimedOutTasks())
    }
}
