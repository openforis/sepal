package task

import static org.openforis.sepal.component.task.api.Task.State.FAILED

class CancelTimedOutTasks_Test extends AbstractTaskTest {
    def 'Given a timed out pending task, when canceling timed out tasks, task is failed, no work was canceled, and session is closed'() {
        timedOutPendingTask()

        when:
        cancelTimedOutTasks()

        then:
        oneTaskIs FAILED
        workerGateway.canceledNone()
        sessionManager.closedOne()
    }

    def 'Given a timed out active task, when canceling timed out tasks, task is failed, work is canceled, and session is closed'() {
        timedOutActiveTask()

        when:
        cancelTimedOutTasks()

        then:
        oneTaskIs FAILED
        workerGateway.canceledOne()
        sessionManager.closedOne()
    }

    def 'Given two task, one timed out, when canceling timed out tasks, session is not closed'() {
        timedOutPendingTask()
        pendingTask()

        when:
        cancelTimedOutTasks()

        then:
        sessionManager.closedNone()
    }

    def 'Given two task on separate instance types, one timed out, when canceling timed out tasks, task is failed, and session is closed'() {
        timedOutPendingTask()
        pendingTask(instanceType: 'another-instance-type')

        when:
        cancelTimedOutTasks()

        then:
        oneTaskIs FAILED
        sessionManager.closedOne()
    }

    def 'Given two task for different users, one timed out, when canceling timed out tasks, task is failed, and session is closed'() {
        timedOutPendingTask()
        pendingTask(username: 'another-username')

        when:
        cancelTimedOutTasks()

        then:
        oneTaskIs FAILED
        sessionManager.closedOne()
    }
}
