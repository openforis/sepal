package component.workerinstance

class FindMissingInstances_Test extends AbstractWorkerInstanceTest {
    def 'Given an id without instance, when executing, instance is returned'() {
        def instance = provisionedInstance()
        releaseInstance(instance)

        when:
        def missing = findMissingInstances([instance])

        then:
        missing == [instance]
    }

    def 'Given an id with instance, when executing, instance is not returned'() {
        def instance = provisionedInstance()

        when:
        def missing = findMissingInstances([instance])

        then:
        !missing
    }
}

