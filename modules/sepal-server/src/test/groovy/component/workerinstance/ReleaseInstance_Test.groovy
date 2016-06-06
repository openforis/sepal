package component.workerinstance

import org.openforis.sepal.component.workerinstance.event.InstanceReleased

class ReleaseInstance_Test extends AbstractWorkerInstanceTest {

    def 'When releasing an instance, it is undeployed, released, and event is published'() {
        def instance = provisionedInstance()

        when:
        releaseInstance(instance)

        then:
        instanceProvisioner.provisionedNone()
        instanceProvider.oneIdle() == instance.release()
        def event = published InstanceReleased
        event.instance == instance.release()
    }
}

