package task

import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.Timeout
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
        hasOneTask().state == PROVISIONING
    }

    def 'Given a submitted task, when cancelling task, task has state CANCELED'() {
        def taskId = submit(operation()).id

        when:
        cancel(taskId)

        then:
        hasOneTask().state == CANCELED
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
        instanceStarted(submittedTask)

        then:
        hasOneTask().state == PROVISIONING
    }

    def 'Given a provisioning task, when submitting another task, task is PROVISIONING'() {
        def submittedTask = submit operation()
        instanceStarted(submittedTask)

        when:
        submit operation()

        then:
        hasTasks(2).each {
            assert it.state == PROVISIONING
        }
    }

    def 'Given a provisioning task, when provisioning is completed, task is ACTIVE'() {
        def submittedTask = submit operation()
        instanceStarted(submittedTask)

        when:
        instanceProvisioned(submittedTask)

        then:
        hasOneTask().state == ACTIVE
    }

    def 'Given a timed out startup, when locating timed out task, task is FAILED'() {
        clock.set()
        submit operation()
        wait(Timeout.INSTANCE_STARTING)

        when:
        handleTimedOutTasks()

        then:
        hasOneTask().state == FAILED
    }

    def 'Given a timed out provisioning, when locating timed out task, task is FAILED'() {
        clock.set()
        def submittedTask = submit operation()
        instanceStarted(submittedTask)
        wait(Timeout.PROVISIONING)

        when:
        handleTimedOutTasks()

        then:
        hasOneTask().state == FAILED
    }

    def 'Given a timed out submission, when locating timed out task, task is FAILED'() {
        clock.set()
        def submittedTask = submit operation()
        instanceStarted(submittedTask)
        instanceProvisioned(submittedTask)
        wait(Timeout.ACTIVE)

        when:
        handleTimedOutTasks()

        then:
        hasOneTask().state == FAILED
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

    private Date wait(Timeout timeout) {
        clock.forward(timeout.time, timeout.timeUnit)
    }
}
