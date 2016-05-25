package task

import fake.Database
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.Operation
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.Timeout
import org.openforis.sepal.component.task.command.CancelTask
import org.openforis.sepal.component.task.command.ExecutePendingTasks
import org.openforis.sepal.component.task.command.HandleTimedOutTasks
import org.openforis.sepal.component.task.command.SubmitTask
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import sandboxmanager.FakeClock
import spock.lang.Specification

abstract class AbstractTaskComponentTest extends Specification {
    final someUserName = 'some-username'
    final someInstanceType = 'some-instance-type'

    final clock = new FakeClock()
    final eventDispatcher = new HandlerRegistryEventDispatcher()
    final instanceProvider = new FakeInstanceProvider(eventDispatcher)
    final instanceProvisioner = new FakeInstanceProvisioner(eventDispatcher)
    final tasxExecutorGateway = new FakeTaskExecutorGateway(eventDispatcher)
    final database = new Database()
    final component = new TaskComponent(
            database.dataSource,
            instanceProvider,
            instanceProvisioner,
            tasxExecutorGateway,
            eventDispatcher,
            clock
    )

    def cleanup() {
        component.stop()
    }

    final Task submit(Operation task) {
        return component.submit(new SubmitTask(task: task, username: someUserName, instanceType: someInstanceType))
    }

    final Task submitForInstanceType(Operation task, String instanceType) {
        return component.submit(new SubmitTask(task: task, username: someUserName, instanceType: instanceType))
    }

    final Task submitForUser(Operation task, String username) {
        return component.submit(new SubmitTask(task: task, username: username, instanceType: someInstanceType))
    }

    final void executePendingTasks() {
        component.submit(new ExecutePendingTasks())
    }

    final void cancel(long taskId) {
        component.submit(new CancelTask(taskId: taskId, username: someUserName))
    }

    final void handleTimedOutTasks() {
        component.submit(new HandleTimedOutTasks())
    }

    final Operation operation() {
        new Operation(name: 'someTask', data: [some: 'argument'])
    }

    final Instance launchIdle(String instanceType = someInstanceType) {
        instanceProvider.launchIdle(instanceType)
    }

    Instance instanceStarted(Task task) {
        instanceProvider.instanceStarted(task.instanceId)
    }

    Instance instanceProvisioned(Task task) {
        instanceProvisioner.instanceProvisioned(task.instanceId)
    }

    void wait(Timeout timeout) {
        clock.forward(timeout.time, timeout.timeUnit)
    }
}
