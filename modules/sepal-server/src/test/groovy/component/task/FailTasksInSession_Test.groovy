package component.task

import static org.openforis.sepal.component.task.api.Task.State.FAILED

class FailTasksInSession_Test extends AbstractTaskTest {
    def 'Given a task, when failing tasks in session, '() {
        def task = activeTask()

        when:
        failTasksInSession(task.sessionId)

        then:
        oneTaskIs(FAILED)
    }
}
