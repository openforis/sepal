package component.task

import fake.Database
import fake.FakeClock
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.Timeout
import org.openforis.sepal.component.task.command.*
import org.openforis.sepal.component.task.query.UserTasks
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import spock.lang.Specification

abstract class AbstractTaskTest extends Specification {
    final database = new Database()
    final connectionManager = new SqlConnectionManager(database.dataSource)
    final eventDispatcher = new SynchronousEventDispatcher()
    final sessionManager = new FakeWorkerSessionManager()
    final workerGateway = new FakeWorkerGateway()
    final clock = new FakeClock()
    final component = new TaskComponent(
            connectionManager,
            eventDispatcher,
            sessionManager,
            workerGateway,
            clock)

    final testInstanceType = 'test-instance-type'
    final testUsername = 'test-user'
    final testOperation = 'test-operation'
    final testParams = [test: 'params']


    final Task submitTask(Map args = [:]) {
        component.submit(
                new SubmitTask(
                        username: username(args),
                        instanceType: args.instanceType ?: testInstanceType,
                        operation: args.operation ?: testOperation,
                        params: args.params ?: testParams
                ))
    }

    final Task resubmitTask(Task task, Map args = [:]) {
        component.submit(new ResubmitTask(
                username: username(args),
                instanceType: args.instanceType ?: testInstanceType,
                taskId: task.id
        ))
    }

    final Task pendingTask(Map args = [:]) {
        submitTask(args)
    }

    final Task activeTask(Map args = [:]) {
        def task = submitTask(args)
        sessionManager.activate(task.sessionId)
        return task
    }

    final Task completedTask(Map args = [:]) {
        def task = activeTask().complete()
        updateTaskProgress(task, args)
        return task
    }

    final Task canceledTask(Map args = [:]) {
        def task = activeTask(args)
        cancelTask(task, args)
        return task
    }

    final Task failedTask(Map args = [:]) {
        def task = timedOutPendingTask(args)
        cancelTimedOutTasks(args)
        return task.fail()
    }

    final Task timedOutPendingTask(Map args = [:]) {
        clock.set()
        def task = submitTask(args)
        clock.set(Timeout.PENDING.willTimeout(clock.now()))
        return task
    }

    final Task timedOutActiveTask(Map args = [:]) {
        clock.set()
        def task = activeTask(args)
        clock.set(Timeout.ACTIVE.willTimeout(clock.now()))
        return task
    }

    List<Task> listTasks(Map args = [:]) {
        component.submit(new UserTasks(username: username(args)))
    }

    final void cancelTask(Task task, Map args = [:]) {
        component.submit(new CancelTask(username: username(args), taskId: task.id))
    }

    final void cancelTimedOutTasks(Map args = [:]) {
        component.submit(new CancelTimedOutTasks(args))
    }

    final void cancelUserTasks(Map args = [:]) {
        component.submit(new CancelUserTasks(username: username(args)))
    }

    final void failTasksInSession(String sessionId) {
        component.submit(new FailTasksInSession(sessionId, 'Some reason for the failure'))
    }

    final void updateTaskProgress(Task task, Map args = [:]) {
        component.submit(new UpdateTaskProgress(
                username: task.username,
                taskId: task.id,
                state: task.state,
                statusDescription: args.statusDescription ?: 'Updated status description'))
    }

    final void removeTask(Task task, Map args = [:]) {
        component.submit(new RemoveTask(username: username(args), taskId: task.id))
    }

    final void removeUserTasks(Map args = [:]) {
        component.submit(new RemoveUserTasks(username: username(args)))
    }

    final void noTaskIs(Task.State state, Map args = [:]) {
        def tasks = listTasks(args)
        def tasksInState = tasks.findAll { it.state == state }
        assert tasksInState.empty,
                "Expected no task for user ${username(args)} to be in state $state. Actually is ${tasksInState.size()}: $tasksInState"
    }

    final Task oneTaskIs(Task.State state, Map args = [:]) {
        def tasks = listTasks(args)
        def tasksInState = tasks.findAll { it.state == state }
        assert tasksInState.size() == 1,
                "Expected one task for user ${username(args)} to be in state $state. Actually is ${tasksInState.size()}: $tasksInState"
        return tasksInState.first()
    }

    final List<Task> twoTasksAre(Task.State state, Map args = [:]) {
        def tasks = listTasks(args)
        def tasksInState = tasks.findAll { it.state == state }
        assert tasksInState.size() == 2,
                "Expected two tasks for user ${username(args)} to be in state $state. Actually is ${tasksInState.size()}: $tasksInState"
        return tasksInState
    }

    private final username(Map args) {
        args.username ?: testUsername
    }
}
