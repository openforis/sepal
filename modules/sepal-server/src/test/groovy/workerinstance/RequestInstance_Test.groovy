package workerinstance

class RequestInstance_Test extends AbstractWorkerInstanceTest {
    def 'Given no idle instances, when requesting instance, instance is launched'() {
        when:
        def instance = requestInstance()

        then:
        def launchedInstance = instanceProvider.launchedOne()
        instance == launchedInstance
    }

    def 'Given an idle instance, when requesting instance, instance is reserved, and no additional instance is launched'() {
        def idleInstance = idleInstance()

        when:
        def instance = requestInstance()

        then:
        instance == idleInstance
        instanceProvider.reservedOne()
        instanceProvider.launchedOne()
    }
}
