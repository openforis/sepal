package workerinstance

import static java.util.concurrent.TimeUnit.MINUTES

class SizeIdlePool_Test extends AbstractWorkerInstanceTest {
    def 'Given no idle instances, when sizing idle pool to one, one idle instance is requested'() {
        when:
        sizeIdlePool((testInstanceType): 1)

        then:
        instanceProvider.oneIdle()
    }

    def 'Given an idle instance, when sizing idle pool to one, no additional idle instance is requested'() {
        idleInstance()

        when:
        sizeIdlePool((testInstanceType): 1)

        then:
        instanceProvider.oneIdle()
    }

    def 'Given an idle instance, and instance is charged soon, when sizing idle pool to zero, instance is terminated'() {
        clock.set()
        idleInstance()
        clock.forward(59, MINUTES)

        when:
        sizeIdlePool((testInstanceType): 0)

        then:
        instanceProvider.noIdle()
    }
}
