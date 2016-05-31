package component.task

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING

class SubmitTask_Test extends AbstractTaskTest {
    def 'When submitting task, task is pending, session is requested, and a generated task is returned'() {
        when:
        def task = submitTask()

        then:
        oneTaskIs PENDING
        sessionManager.requestedOne()
        task
    }

    def 'Given a submitted task, when submitting another, two tasks are pending, and another session is not requested'() {
        submitTask()

        when:
        submitTask()

        then:
        twoTasksAre PENDING
        sessionManager.requestedOne()
    }

    def 'Given a submitted task on an active session, when submitting another, both tasks are active and have been executed'() {
        activeTask()

        when:
        submitTask()

        then:
        twoTasksAre ACTIVE
        def executed = workerGateway.executedTwo()
        executed.each {
            assert it.session.host != null
        }
    }

    def 'Given an active task, when submitting another on a different instance type, one task is pending, and a second session is requested'() {
        activeTask(instanceType: 'another-instance-type')

        when:
        submitTask()

        then:
        oneTaskIs PENDING
        sessionManager.requestedTwo()
    }

    def 'Given an active task, when submitting another for a different user, one task is pending, and a second session is requested'() {
        activeTask(username: 'another-username')

        when:
        submitTask()

        then:
        oneTaskIs PENDING
        sessionManager.requestedTwo()
    }
}
