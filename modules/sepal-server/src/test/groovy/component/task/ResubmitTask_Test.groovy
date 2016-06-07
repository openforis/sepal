package component.task

import org.openforis.sepal.command.ExecutionFailed

import static org.openforis.sepal.component.task.api.Task.State.*

class ResubmitTask_Test extends AbstractTaskTest {
    def 'When resubmitting existing task, task is removed and a new is submitted'() {
        def task = completedTask()

        when:
        resubmitTask(task)

        then:
        noTaskIs ACTIVE
        oneTaskIs PENDING
    }

    def 'When resubmitting existing task for another user, exception is thrown, task is not removed, and no new task is resubmitted'() {
        def task = completedTask()

        when:
        resubmitTask(task, [username: 'another-username'])

        then:
        thrown ExecutionFailed
        oneTaskIs COMPLETED
        noTaskIs PENDING
    }

    def 'Given an active task, when resubmitting, execution fails'() {
        def task = activeTask()

        when:
        resubmitTask(task)

        then:
        thrown ExecutionFailed
    }
}
