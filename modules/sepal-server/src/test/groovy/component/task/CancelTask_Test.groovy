package component.task

import org.openforis.sepal.command.ExecutionFailed

import static org.openforis.sepal.component.task.api.Task.State.CANCELING

class CancelTask_Test extends AbstractTaskTest {
    def 'Given one pending task, when canceling it, task is canceling, work is not canceled'() {
        def task = pendingTask()

        when:
        cancelTask(task)

        then:
        oneTaskIs CANCELING
        workerGateway.canceledNone()
    }

    def 'Given one active task, when canceling it, task is canceling and work is canceled'() {
        def task = activeTask()

        when:
        cancelTask(task)

        then:
        oneTaskIs CANCELING
        workerGateway.canceledOne()
    }

    def 'Given two active tasks, when canceling one, task is canceling and work is canceled'() {
        activeTask()
        def task = activeTask()

        when:
        cancelTask(task)

        then:
        oneTaskIs CANCELING
        workerGateway.canceledOne()
    }

    def 'Given task, when other user cancel task, task is not canceling, and execution fails'() {
        def task = activeTask([username: 'another-username'])

        when:
        cancelTask(task)

        then:
        noTaskIs CANCELING
        thrown ExecutionFailed
    }
}
