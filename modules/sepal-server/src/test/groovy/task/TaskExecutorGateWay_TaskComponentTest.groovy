package task

class TaskExecutorGateWay_TaskComponentTest extends AbstractTaskComponentTest {
    def 'Given a provisioning task, when provisioning is completed, task is executed'() {
        def task = submit operation()
        instanceStarted(task.instanceId)

        when:
        instanceProvisioned(task)

        then:
        tasxExecutorGateway.executedOne()
    }

    def 'Given an active task, when submitting another, task is executed'() {
        def task = submit operation()
        instanceStarted(task.instanceId)
        instanceProvisioned(task)

        when:
        submit operation()

        then:
        tasxExecutorGateway.executed(2)
    }
}