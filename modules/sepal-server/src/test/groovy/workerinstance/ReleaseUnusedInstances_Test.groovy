package workerinstance

import org.openforis.sepal.component.workerinstance.event.FailedToReleaseInstance

import java.util.concurrent.TimeUnit

import static java.util.concurrent.TimeUnit.MINUTES

class ReleaseUnusedInstances_Test extends AbstractWorkerInstanceTest {
    def 'Given an unused instance, when releasing unused instances, instance is undeployed, released, and event is published'() {
        def unusedInstance = ago(2, MINUTES) {
            requestInstance()
        }

        when:
        releaseUnusedInstances([], 1, MINUTES)

        then:
        instanceProvider.oneIdle() == unusedInstance.release()
    }

    def 'Given an unused instance recently launched, when releasing unused instances, instance is still provisioned'() {
        ago(1, MINUTES) {
            provisionedInstance()
        }

        when:
        releaseUnusedInstances([], 2, MINUTES)
        true

        then:
        instanceProvisioner.provisionedOne()
        instanceProvider.noIdle()
    }

    def 'Given a used instance, when releasing unused instances, instance is still provisioned'() {
        def usedInstance = ago(2, MINUTES) {
            provisionedInstance()
        }

        when:
        releaseUnusedInstances([usedInstance.id], 1, MINUTES)

        then:
        instanceProvisioner.provisionedOne()
        instanceProvider.noIdle()
    }

    def 'Given an unused instance and provisioner failing to undeploy, when releasing unused instances, event is published and instance is terminated'() {
        instanceProvisioner.fail()
        ago(2, MINUTES) {
            requestInstance()
        }

        when:
        releaseUnusedInstances([], 1, MINUTES)

        then:
        published FailedToReleaseInstance
        instanceProvider.terminatedOne()
    }

    def <T> T ago(int time, TimeUnit timeUnit, Closure<T> callback) {
        def result = callback.call()
        clock.forward(time, timeUnit)
        return result
    }
}
