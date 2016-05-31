package workerinstance

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
}
