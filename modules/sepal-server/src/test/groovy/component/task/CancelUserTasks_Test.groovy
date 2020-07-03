package component.task

import static org.openforis.sepal.component.task.api.Task.State.CANCELING

class CancelUserTasks_Test extends AbstractTaskTest {
    def 'Given a task, when canceling user tasks, task is canceling and work is not canceled'() {
        pendingTask()

        when:
        cancelUserTasks()

        then:
        oneTaskIs CANCELING
        workerGateway.canceledNone()
    }
}
