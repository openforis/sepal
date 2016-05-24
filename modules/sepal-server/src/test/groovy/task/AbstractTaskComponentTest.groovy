package task

import fake.Database
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.TaskStatus
import org.openforis.sepal.component.task.command.CancelTask
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
    final tasxExecutorGateway = new FakeTaskExecutorGateway()
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

    final TaskStatus submit(Task task) {
        return component.submit(new SubmitTask(task: task, username: someUserName, instanceType: someInstanceType))
    }

    final TaskStatus submitForInstanceType(Task task, String instanceType) {
        return component.submit(new SubmitTask(task: task, username: someUserName, instanceType: instanceType))
    }

    final TaskStatus submitForUser(Task task, String username) {
        return component.submit(new SubmitTask(task: task, username: username, instanceType: someInstanceType))
    }

    final void cancel(long taskId) {
        component.submit(new CancelTask(taskId: taskId, username: someUserName))
    }

    final Task task() {
        new Task(operation: 'someTask', data: [some: 'argument'])
    }

    final Instance launchIdle(String instanceType = someInstanceType) {
        instanceProvider.launchIdle(instanceType)
    }

    Instance instanceStarted(String instanceId) {
        instanceProvider.instanceStarted(instanceId)
    }

    Instance instanceProvisioned(TaskStatus status) {
        instanceProvisioner.instanceProvisioned(status.instanceId)
    }
}
