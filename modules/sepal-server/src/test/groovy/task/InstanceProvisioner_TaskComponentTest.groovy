package task

import org.openforis.sepal.component.task.Instance

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR

class InstanceProvisioner_TaskComponentTest extends AbstractTaskComponentTest {
    def 'Given a submitted task, when instance has started, it is provisioned'() {
        def task = submit operation()

        when:
        def instance = instanceStarted(task.instanceId)

        then:
        def provisioningInstance = provisioningOne()
        provisioningInstance == instance.toProvisioning()
    }

    def 'Given a submitted task, when cancelling task, instance is undeployed'() {
        def task = submit(operation())
        instanceStarted(task.instanceId)

        when:
        cancel(task.id)

        then:
        provisioningNone()
    }
 // TODO: Make sure used instances are not undeployed

    Instance provisioningOne() {
        instanceProvisioner.provisioningOne(TASK_EXECUTOR)
    }

    void provisioningNone() {
        instanceProvisioner.provisioningNone(TASK_EXECUTOR)
    }
}