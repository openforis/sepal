package component.task

import static org.openforis.sepal.component.task.api.Task.State.*

class RemoveUserTasks_Test extends AbstractTaskTest {
    def 'Given a pending task, when removing all tasks, one task is pending'() {
        pendingTask()

        when:
        removeUserTasks()

        then:
        oneTaskIs PENDING
    }

    def 'Given an active task, when removing all tasks, one task is active'() {
        activeTask()

        when:
        removeUserTasks()

        then:
        oneTaskIs ACTIVE
    }

    def 'Given a canceled task, when removing all tasks, no task is canceled'() {
        canceledTask()

        when:
        removeUserTasks()

        then:
        noTaskIs CANCELED
    }

    def 'Given a failed task, when removing all tasks, no task is failed'() {
        failedTask()

        when:
        removeUserTasks()

        then:
        noTaskIs FAILED
    }

    def 'Given a completed task, when removing all tasks, no task is completed'() {
        completedTask()

        when:
        removeUserTasks()

        then:
        noTaskIs COMPLETED
    }
}
