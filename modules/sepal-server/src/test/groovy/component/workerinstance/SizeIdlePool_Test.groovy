package component.workerinstance

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

    def 'Given two idle instances, when sizing idle pool to one, one idle instance remains'() {
        idleInstance()
        idleInstance()

        when:
        sizeIdlePool((testInstanceType): 1)

        then:
        instanceProvider.oneIdle()
    }
}
