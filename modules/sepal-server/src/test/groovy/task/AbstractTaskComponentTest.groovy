package task

import fake.Database
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.TaskStatus
import org.openforis.sepal.component.task.command.CancelTask
import org.openforis.sepal.component.task.command.SubmitTask
import sandboxmanager.FakeClock
import spock.lang.Specification

abstract class AbstractTaskComponentTest extends Specification {
    final someUserName = 'some-username'
    final someInstanceType = 'some-instance-type'

    final clock = new FakeClock()
    final instanceProvider = new FakeInstanceProvider()
    final database = new Database()
    final component = new TaskComponent(
            database.dataSource,
            instanceProvider,
            clock
    )

    def cleanup() {
        component.stop()
    }

    final TaskStatus submit(Task task, String username = someUserName) {
        return component.submit(new SubmitTask(task: task, username: username, instanceType: someInstanceType))
    }

    final void cancel(long taskId) {
        component.submit(new CancelTask(taskId: taskId, username: someUserName))
    }

    final Task task() {
        new Task(operation: 'someTask', data: [some: 'argument'])
    }

    final Instance launchIdle() {
        instanceProvider.launchIdle(someInstanceType)
    }
}
