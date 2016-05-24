package task

import org.openforis.sepal.component.task.Instance

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR
import static org.openforis.sepal.component.task.Instance.State.ACTIVE

class InstanceProvider_TaskComponentTest extends AbstractTaskComponentTest {
    def 'When submitting a task, an instance is launched'() {
        when:
        submit task()

        then:
        instanceProvider.launchedOne()
    }

    def 'Given a submitted task, when submitting a second task, no new instance instance has been launched'() {
        submit task()

        when:
        submit task()

        then:
        instanceProvider.launchedOne()
    }

    def 'Given an idle instance, when submitting a task, no new instance has been launched'() {
        def idleInstance = launchIdle()

        when:
        submit task()

        then:
        def instance = instanceProvider.launchedOne()
        instance == idleInstance.toProvisioning(someUserName, TASK_EXECUTOR)
    }

    def 'Given a submitted task, when cancelling task, instance is made idle'() {
        def taskId = submit(task()).id

        when:
        cancel(taskId)

        then:
        def instance = instanceProvider.launchedOne()
        instance.role == Instance.Role.IDLE
        !instance.username
        !instance.state
    }

    def 'Given two submitted task on same instance, when cancelling task, instance is still active'() {
        submit task()
        def taskId = submit(task()).id

        when:
        cancel(taskId)

        then:
        def instance = instanceProvider.launchedOne()
        instance.role != Instance.Role.IDLE
    }

    def 'Given an idle instance, when submitting a task for another instance type, a new instance is launched'() {
        launchIdle()

        when:
        submitForInstanceType(task(), 'another-instance-type')

        then:
        def instances = instanceProvider.launched(2)
        instances.first().type == someInstanceType
        instances.last().type == 'another-instance-type'
    }

    def 'Given a submitted task, when submitting a task for another instance type, a new instance is launched'() {
        submit task()

        when:
        submitForInstanceType(task(), 'another-instance-type')

        then:
        def instances = instanceProvider.launched(2)
        instances.first().type == someInstanceType
        instances.last().type == 'another-instance-type'
    }

    def 'Given a submitted task, when submitting a task for another user, a new instance is launched'() {
        submit task()

        when:
        submitForUser(task(), 'another-username')

        then:
        instanceProvider.launched(2)
    }


    def 'Given a provisioning task, when provisioning is completed, instance is ACTIVE'() {
        def status = submit task()
        instanceStarted(status.instanceId)

        when:
        instanceProvisioned(status)

        then:
        def instance = instanceProvider.launchedOne()
        instance.state == ACTIVE
    }
}