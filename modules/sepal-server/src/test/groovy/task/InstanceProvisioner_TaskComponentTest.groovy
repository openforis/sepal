package task

import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.Timeout

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR
import static org.openforis.sepal.component.task.State.FAILED

class InstanceProvisioner_TaskComponentTest extends AbstractTaskComponentTest {
    def 'Given a submitted task, when instance has started, it is provisioned'() {
        def task = submit operation()

        when:
        def instance = instanceStarted(task)

        then:
        def provisioningInstance = provisionedOne()
        provisioningInstance == instance.toProvisioning()
    }

    def 'Given a submitted task, when cancelling task, instance is undeployed'() {
        def task = submit(operation())
        instanceStarted(task)

        when:
        cancel(task.id)

        then:
        provisionedNone()
    }

    def 'Given two submitted task on same instance, when cancelling one task, instance is not undeployed'() {
        submit operation()
        def task = submit(operation())
        instanceStarted(task)

        when:
        cancel(task.id)

        then:
        provisionedOne()
    }

    def 'Given a timed out submission, when locating timed out task, instance is undeployed'() {
        clock.set()
        def submittedTask = submit operation()
        instanceStarted(submittedTask)
        instanceProvisioned(submittedTask)
        wait(Timeout.ACTIVE)

        when:
        handleTimedOutTasks()

        then:
        provisionedNone()
    }

    Instance provisionedOne() {
        instanceProvisioner.provisionedOne(TASK_EXECUTOR)
    }

    void provisionedNone() {
        instanceProvisioner.provisionedNone(TASK_EXECUTOR)
    }
}