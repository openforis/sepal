package task

class UpdateTaskProgress_Test extends AbstractTaskTest {
    def 'Given an active task, when updating progress, session heartbeat is sent'() {
        def task = activeTask()

        when:
        updateTaskProgress(task)

        then:
        sessionManager.receivedOneHeartbeat()
    }

    def 'Given a timed out active task, when updating progress, it is no longer considered timed out'() {
        def task = timedOutActiveTask()

        when:
        updateTaskProgress(task)

        then:
        cancelTimedOutTasks()
        workerGateway.canceledNone()
    }

    def 'Given an active task, when updating to completed, session is closed'() {
        def task = activeTask()

        when:
        updateTaskProgress(task.complete())

        then:
        sessionManager.closedOne()
    }

    def 'Given two active tasks, when updating one to completed, session is not closed'() {
        activeTask()
        def task = activeTask()

        when:
        updateTaskProgress(task.complete())

        then:
        sessionManager.closedNone()
    }

    def 'Given an active task, when updating to failed, session is closed'() {
        def task = activeTask()

        when:
        updateTaskProgress(task.fail())

        then:
        sessionManager.closedOne()
    }

    def 'Given two active tasks, when updating one to failed, session is not closed'() {
        activeTask()
        def task = activeTask()

        when:
        updateTaskProgress(task.fail())

        then:
        sessionManager.closedNone()
    }

    def 'Given two active tasks on different instance types, when updating one to failed, session is closed'() {
        def task = activeTask()
        activeTask(instanceType: 'another-instance-type')

        when:
        updateTaskProgress(task.fail())

        then:
        sessionManager.closedOne()
    }

    def 'Given two active tasks for different users, when updating one to failed, session is closed'() {
        def task = activeTask()
        activeTask(username: 'another-username')

        when:
        updateTaskProgress(task.fail())

        then:
        sessionManager.closedOne()
    }
}
