package workerinstance

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
}
