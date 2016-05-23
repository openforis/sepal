package task

import org.openforis.sepal.component.task.TaskStatus
import org.openforis.sepal.component.task.query.ListTaskStatuses

import static org.openforis.sepal.component.task.State.*

class TaskStatuses_TaskComponentTest extends AbstractTaskComponentTest {
    def 'Given no tasks have been submitted, user has no statuses'() {
        expect:
        hasNoStatuses()
    }

    def 'When submitting a task, user has one status in state STARTING_INSTANCE'() {
        def task = task()

        when:
        submit task

        then:
        def status = hasOneStatus()
        status.username == someUserName
        status.state == STARTING_INSTANCE
        status.task == task
    }

    def 'When submitting two tasks, user has two statuses, both in state STARTING_INSTANCE'() {
        when:
        submit task()
        submit task()

        then:
        def statuses = hasStatuses(2)
        statuses.each {
            assert it.state == STARTING_INSTANCE
        }
    }

    def 'Given an idle instance, when submitting a task, user has one status in state DEPLOYING'() {
        launchIdle()

        when:
        submit task()

        then:
        def status = hasOneStatus()
        status.state == DEPLOYING
    }

    def 'Given a submitted task, when cancelling task, status has state CANCELED'() {
        def taskId = submit(task()).id

        when:
        cancel(taskId)

        then:
        def status = hasOneStatus()
        status.state == CANCELED
    }

    final List<TaskStatus> listTaskStatuses(String username = someUserName) {
        component.submit(new ListTaskStatuses(username: username))
    }

    final void hasNoStatuses() {
        String username = someUserName
        def statuses = component.submit(new ListTaskStatuses(username: username))
        assert statuses.empty, "Expected no task statuses, got ${statuses.size()}: $statuses"
    }

    final TaskStatus hasOneStatus() {
        String username = someUserName
        def statuses = component.submit(new ListTaskStatuses(username: username))
        assert statuses.size() == 1, "Expected one task statuses, got ${statuses.size()}: $statuses"
        return statuses.first()
    }

    final List<TaskStatus> hasStatuses(int count) {
        String username = someUserName
        def statuses = component.submit(new ListTaskStatuses(username: username))
        assert statuses.size() == count, "Expected $count task statuses, got ${statuses.size()}: $statuses"
        return statuses
    }

}
