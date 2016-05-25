package task

class TaskExecutorGateWay_TaskComponentTest extends AbstractTaskComponentTest {
    def 'Given a provisioning task, when provisioning is completed, task is executed'() {
        def task = submit operation()
        instanceStarted(task)

        when:
        instanceProvisioned(task)

        then:
        tasxExecutorGateway.executedOne()
    }

    def 'Given an active task, when submitting another, task is executed'() {
        def task = submit operation()
        instanceStarted(task)
        instanceProvisioned(task)

        when:
        submit operation()

        then:
        tasxExecutorGateway.executed(2)
    }

    def 'Given an active task, when executing pending tasks, task is not executed again'() {
        def task = submit operation()
        instanceStarted(task)
        instanceProvisioned(task)

        when:
        executePendingTasks()

        then:
        tasxExecutorGateway.executedOne()
    }

    def 'Given a canceled task, when executing pending tasks, no task is executed'() {
        def task = submit operation()
        cancel(task.id)

        when:
        executePendingTasks()

        then:
        tasxExecutorGateway.executedNone()
    }
}