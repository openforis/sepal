package task

import org.openforis.sepal.component.task.Timeout

import static org.openforis.sepal.component.task.Instance.Role.IDLE
import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR
import static org.openforis.sepal.component.task.Instance.State.ACTIVE

class InstanceProvider_TaskComponentTest extends AbstractTaskComponentTest {
    def 'When submitting a task, an instance is launched'() {
        when:
        submit operation()

        then:
        instanceProvider.launchedOne()
    }

    def 'Given a submitted task, when submitting a second task, no new instance instance has been launched'() {
        submit operation()

        when:
        submit operation()

        then:
        instanceProvider.launchedOne()
    }

    def 'Given an idle instance, when submitting a task, no new instance has been launched'() {
        def idleInstance = launchIdle()

        when:
        submit operation()

        then:
        def instance = instanceProvider.launchedOne()
        instance == idleInstance.toProvisioning(someUserName, TASK_EXECUTOR)
    }

    def 'Given a submitted task, when cancelling task, instance is made idle'() {
        def taskId = submit(operation()).id

        when:
        cancel(taskId)

        then:
        def instance = instanceProvider.launchedOne()
        instance.role == IDLE
        !instance.username
        !instance.state
    }

    def 'Given two submitted task on same instance, when cancelling task, instance is still active'() {
        submit operation()
        def taskId = submit(operation()).id

        when:
        cancel(taskId)

        then:
        def instance = instanceProvider.launchedOne()
        instance.role != IDLE
    }

    def 'Given an idle instance, when submitting a task for another instance type, a new instance is launched'() {
        launchIdle()

        when:
        submitForInstanceType(operation(), 'another-instance-type')

        then:
        def instances = instanceProvider.launched(2)
        instances.first().type == someInstanceType
        instances.last().type == 'another-instance-type'
    }

    def 'Given a submitted task, when submitting a task for another instance type, a new instance is launched'() {
        submit operation()

        when:
        submitForInstanceType(operation(), 'another-instance-type')

        then:
        def instances = instanceProvider.launched(2)
        instances.first().type == someInstanceType
        instances.last().type == 'another-instance-type'
    }

    def 'Given a submitted task, when submitting a task for another user, a new instance is launched'() {
        submit operation()

        when:
        submitForUser(operation(), 'another-username')

        then:
        instanceProvider.launched(2)
    }

    def 'Given a provisioning task, when provisioning is completed, instance is ACTIVE'() {
        def task = submit operation()
        instanceStarted(task)

        when:
        instanceProvisioned(task)

        then:
        instanceProvider.launchedOne().state == ACTIVE
    }

    def 'Given a timed out provisioning, when locating timed out task, instance is IDLE'() {
        clock.set()
        def submittedTask = submit operation()
        instanceStarted(submittedTask)
        wait(Timeout.PROVISIONING)

        when:
        handleTimedOutTasks()

        then:
        instanceProvider.launchedOne().role == IDLE
    }
}