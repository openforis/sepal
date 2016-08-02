package component.workerinstance

import org.openforis.sepal.component.workerinstance.event.FailedToProvisionInstance
import org.openforis.sepal.component.workerinstance.event.InstanceProvisioned

class ProvisionInstance_Test extends AbstractWorkerInstanceTest {
    def 'When provisioning instance, instance is provisioned, and event is published'() {
        def instance = requestInstance()

        when:
        provisionInstance(instance)

        then:
        instanceProvisioner.provisionedOne()
        def event = published InstanceProvisioned
        event.instance == instance
    }

    def 'When reserved instance is launched, it is provisioned'() {
        def instance = requestInstance()
        when:
        instanceProvider.signalLaunched(instance)

        then:
        instanceProvisioner.provisionedOne()
    }

    def 'When idle instance is launched, it is not provisioned'() {
        def instance = idleInstance()
        when:
        instanceProvider.signalLaunched(instance)

        then:
        instanceProvisioner.provisionedNone()
    }

    def 'When failing to provision instance, event is sent and exception is thrown'() {
        instanceProvisioner.fail()
        def instance = requestInstance()

        when:
        provisionInstance(instance)

        then:
        published(FailedToProvisionInstance)
        thrown Exception
    }
}
