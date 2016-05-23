package task

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR
import static org.openforis.sepal.component.task.Instance.State.DEPLOYING

class Instances_TaskComponentTest extends AbstractTaskComponentTest {
    def 'When submitting a task, an instance is launched'() {
        when:
        submit task()

        then:
        instanceProvider.launchedOne()
    }

    def 'Given a submitted task, when submitting a second task, no new instance instance has been launched'() {
        submit task()

        when:
        submit task()

        then:
        instanceProvider.launchedOne()
    }

    def 'Given an idle instance, when submitting a task, no new instance has been launched'() {
        def idleInstance = launchIdle()

        when:
        submit task()

        then:
        def instance = instanceProvider.launchedOne()
        instance == idleInstance.toReserved(someUserName, TASK_EXECUTOR, DEPLOYING)
    }

    def 'Given a submitted task, when cancelling task, instance is made idle'() {
        def taskId = submit(task()).id

        when:
        cancel(taskId)

        then:
        def instance = instanceProvider.launchedOne()
        instance.idle
        !instance.username
        !instance.role
        !instance.state
    }
}