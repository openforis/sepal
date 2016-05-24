package task

import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.query.ListTaskTasks

import static org.openforis.sepal.component.task.State.*

class TaskList_TaskComponentTest extends AbstractTaskComponentTest {
    def 'Given no tasks have been submitted, user has no tasks'() {
        expect:
        hasNoTasks()
    }

    def 'When submitting a task, user has one task in state INSTANCE_STARTING'() {
        def submittedTask = operation()

        when:
        submit submittedTask

        then:
        def task = hasOneTask()
        task.username == someUserName
        task.state == INSTANCE_STARTING
        task.operation == submittedTask
    }

    def 'When submitting two tasks, user has two tasks, both in state INSTANCE_STARTING'() {
        when:
        submit operation()
        submit operation()

        then:
        def tasks = hasTasks(2)
        tasks.each {
            assert it.state == INSTANCE_STARTING
        }
    }

    def 'Given an idle instance, when submitting a task, user has one task in state DEPLOYING'() {
        launchIdle()

        when:
        submit operation()

        then:
        def task = hasOneTask()
        task.state == PROVISIONING
    }

    def 'Given a submitted task, when cancelling task, task has state CANCELED'() {
        def taskId = submit(operation()).id

        when:
        cancel(taskId)

        then:
        def task = hasOneTask()
        task.state == CANCELED
    }

    def 'Given two submitted task on same instance, when cancelling task, only first task is CANCELED'() {
        submit operation()
        def taskId = submit(operation()).id

        when:
        cancel(taskId)

        then:
        def tasks = hasTasks(2)
        tasks.first().state == INSTANCE_STARTING
        tasks.last().state == CANCELED
    }

    def 'Given a submitted task, when instance has started, task is PROVISIONING'() {
        def submittedTask = submit operation()

        when:
        instanceStarted(submittedTask.instanceId)

        then:
        def task = hasOneTask()
        task.state == PROVISIONING
    }

    def 'Given a provisioning task, when submitting another task, task is PROVISIONING'() {
        def submittedTask = submit operation()
        instanceStarted(submittedTask.instanceId)

        when:
        submit operation()

        then:
        def tasks = hasTasks(2)
        tasks.each {
            assert it.state == PROVISIONING
        }
    }

    def 'Given a provisioning task, when provisioning is completed, task is ACTIVE'() {
        def submittedTask = submit operation()
        instanceStarted(submittedTask.instanceId)

        when:
        instanceProvisioned(submittedTask)

        then:
        def task = hasOneTask()
        task.state == ACTIVE
    }

    List<Task> listTasks(String username = someUserName) {
        component.submit(new ListTaskTasks(username: username))
    }

    void hasNoTasks() {
        String username = someUserName
        def tasks = component.submit(new ListTaskTasks(username: username))
        assert tasks.empty, "Expected no tasks, got ${tasks.size()}: $tasks"
    }

    Task hasOneTask() {
        String username = someUserName
        def tasks = component.submit(new ListTaskTasks(username: username))
        assert tasks.size() == 1, "Expected one tasks, got ${tasks.size()}: $tasks"
        return tasks.first()
    }

    List<Task> hasTasks(int count) {
        String username = someUserName
        def tasks = component.submit(new ListTaskTasks(username: username))
        assert tasks.size() == count, "Expected $count tasks, got ${tasks.size()}: $tasks"
        return tasks
    }

}
