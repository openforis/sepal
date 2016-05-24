package task

import org.openforis.sepal.component.task.Instance

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR

class InstanceProvisioner_TaskComponentTest extends AbstractTaskComponentTest {
    def 'Given a submitted task, when instance has started, it is provisioned'() {
        def status = submit task()

        when:
        def instance = instanceStarted(status.instanceId)

        then:
        def provisioningInstance = provisioningOne()
        provisioningInstance == instance.toProvisioning()
    }

    Instance provisioningOne() {
        instanceProvisioner.provisioningOne(TASK_EXECUTOR)
    }
}