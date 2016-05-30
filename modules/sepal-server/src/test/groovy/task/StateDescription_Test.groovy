package task

import static org.openforis.sepal.component.task.api.Task.State.*

class StateDescription_Test extends AbstractTaskTest {
    def 'Pending task has expected description'() {
        pendingTask()

        expect:
        statusDescription() == PENDING.description
    }

    def 'Active task has expected description'() {
        activeTask()

        expect:
        statusDescription() == ACTIVE.description
    }

    def 'Completed task has expected description'() {
        def expectedDescription = 'Completed description'
        completedTask(statusDescription: expectedDescription)

        expect:
        statusDescription() == expectedDescription
    }

    def 'Canceled task has expected description'() {
        canceledTask()

        expect:
        statusDescription() == CANCELED.description
    }

    def 'Failed task has expected description'() {
        failedTask()

        expect:
        statusDescription() == FAILED.description
    }

    def 'Description from status update is used'() {
        def expectedDescription = 'Description from progress update'
        def task = activeTask()
        updateTaskProgress(task, [statusDescription: expectedDescription])

        expect:
        statusDescription() == expectedDescription
    }

    private String statusDescription() {
        listTasks().first().statusDescription
    }
}
