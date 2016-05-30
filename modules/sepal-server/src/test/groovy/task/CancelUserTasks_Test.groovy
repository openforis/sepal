package task

import static org.openforis.sepal.component.task.api.Task.State.CANCELED

class CancelUserTasks_Test extends AbstractTaskTest {
    def 'Given a passive task, when canceling user tasks, task is canceled, work is not canceled, and session is closed'() {
        pendingTask()

        when:
        cancelUserTasks()

        then:
        oneTaskIs CANCELED
        workerGateway.canceledNone()
        sessionManager.closedOne()
    }

    def 'Given an active task, when canceling user tasks, task is canceled, work is canceled, and session is closed'() {
        activeTask()

        when:
        cancelUserTasks()

        then:
        oneTaskIs CANCELED
        workerGateway.canceledOne()
        sessionManager.closedOne()
    }

    def 'Given two active tasks, when canceling user tasks, both tasks and their work is canceled, and session is closed'() {
        activeTask()
        activeTask()

        when:
        cancelUserTasks()

        then:
        twoTasksAre CANCELED
        workerGateway.canceledTwo()
        sessionManager.closedOne()
    }

    def 'Given two active tasks on different instance types, when canceling user tasks, both tasks and their work is canceled, and both sessions are closed'() {
        activeTask()
        activeTask(instanceType: 'another-instance-type')

        when:
        cancelUserTasks()

        then:
        twoTasksAre CANCELED
        workerGateway.canceledTwo()
        sessionManager.closedTwo()
    }

    def 'Given two active tasks for different users, when canceling user tasks, one task and its work is canceled, and one sessions is closed'() {
        activeTask()
        activeTask(username: 'another-username')

        when:
        cancelUserTasks()

        then:
        oneTaskIs CANCELED
        workerGateway.canceledOne()
        sessionManager.closedOne()
    }
}
