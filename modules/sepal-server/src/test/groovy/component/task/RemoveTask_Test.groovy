package component.task

import org.openforis.sepal.command.ExecutionFailed

import static org.openforis.sepal.component.task.api.Task.State.*

class RemoveTask_Test extends AbstractTaskTest {
    def 'When removing a canceled task, it is removed'() {
        def task = canceledTask()

        when:
        removeTask(task)

        then:
        noTaskIs CANCELED
    }

    def 'When removing a failed task, it is removed'() {
        def task = failedTask()

        when:
        removeTask(task)

        then:
        noTaskIs FAILED
    }

    def 'When removing a completed task, it is removed'() {
        def task = completedTask()

        when:
        removeTask(task)

        then:
        noTaskIs COMPLETED
    }

    def 'When removing a pending task, an exception is thrown, and it is not removed'() {
        def task = pendingTask()

        when:
        removeTask(task)

        then:
        thrown ExecutionFailed
        oneTaskIs PENDING
    }

    def 'When removing an active task, an exception is thrown, and it is not removed'() {
        def task = activeTask()

        when:
        removeTask(task)

        then:
        thrown ExecutionFailed
        oneTaskIs ACTIVE
    }

    def 'Given a canceled task, when other user remove task, task is not removed, and execution fails'() {
        def task = canceledTask()

        when:
        removeTask(task, [username: 'another-username'])

        then:
        oneTaskIs CANCELED
        thrown ExecutionFailed
    }
}
