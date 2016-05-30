package workerinstance

class ReleaseInstance_Test extends AbstractWorkerInstanceTest {

    def 'When releasing an instance, it is released'() {
        def instance = requestInstance()

        when:
        releaseInstance(instance)

        then:
        instanceProvider.oneIdle() == instance.release()
    }
}

