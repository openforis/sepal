package workerinstance

import org.openforis.sepal.component.workerinstance.event.FailedToReleaseInstance

class ReleaseUnusedInstances_Test extends AbstractWorkerInstanceTest {
    def 'Given an unused instance, when releasing unused instances, instance is undeployed, released, and event is published'() {
        def unusedInstance = requestInstance()

        when:
        releaseUnusedInstances([])

        then:
        instanceProvider.oneIdle() == unusedInstance.release()
    }

    def 'Given a used instance, when releasing unused instances, instance is still provisioned'() {
        def usedInstance = provisionedInstance()

        when:
        releaseUnusedInstances([usedInstance.id])

        then:
        instanceProvisioner.provisionedOne()
        instanceProvider.noIdle()
    }

    def 'Given an unused instance and provisioner failing to undeploy, when releasing unused instances, event is published and instance is terminated'() {
        requestInstance()
        instanceProvisioner.fail()

        when:
        releaseUnusedInstances([])

        then:
        published FailedToReleaseInstance
        instanceProvider.terminatedOne()
    }
}
