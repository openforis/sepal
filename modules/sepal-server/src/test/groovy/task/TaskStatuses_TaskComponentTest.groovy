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
        status.state == INSTANCE_STARTING
        status.task == task
    }

    def 'When submitting two tasks, user has two statuses, both in state STARTING_INSTANCE'() {
        when:
        submit task()
        submit task()

        then:
        def statuses = hasStatuses(2)
        statuses.each {
            assert it.state == INSTANCE_STARTING
        }
    }

    def 'Given an idle instance, when submitting a task, user has one status in state DEPLOYING'() {
        launchIdle()

        when:
        submit task()

        then:
        def status = hasOneStatus()
        status.state == PROVISIONING
    }

    def 'Given a submitted task, when cancelling task, status has state CANCELED'() {
        def taskId = submit(task()).id

        when:
        cancel(taskId)

        then:
        def status = hasOneStatus()
        status.state == CANCELED
    }

    def 'Given two submitted task on same instance, when cancelling task, only first task is CANCELED'() {
        submit task()
        def taskId = submit(task()).id

        when:
        cancel(taskId)

        then:
        def statuses = hasStatuses(2)
        statuses.first().state == INSTANCE_STARTING
        statuses.last().state == CANCELED
    }

    def 'Given a submitted task, when instance has started, task is PROVISIONING'() {
        def status = submit task()

        when:
        instanceStarted(status.instanceId)

        then:
        def provisioningStatus = hasOneStatus()
        provisioningStatus.state == PROVISIONING
    }

    def 'Given a provisioning task, when submitting another task, task is PROVISIONING'() {
        def status = submit task()
        instanceStarted(status.instanceId)

        when:
        submit task()

        then:
        def statuses = hasStatuses(2)
        statuses.each {
            assert it.state == PROVISIONING
        }
    }

    def 'Given a provisioning task, when provisioning is completed, task is ACTIVE'() {
        def status = submit task()
        instanceStarted(status.instanceId)

        when:
        instanceProvisioned(status)

        then:
        def activeStatus = hasOneStatus()
        activeStatus.state == ACTIVE
    }


    List<TaskStatus> listTaskStatuses(String username = someUserName) {
        component.submit(new ListTaskStatuses(username: username))
    }

    void hasNoStatuses() {
        String username = someUserName
        def statuses = component.submit(new ListTaskStatuses(username: username))
        assert statuses.empty, "Expected no task statuses, got ${statuses.size()}: $statuses"
    }

    TaskStatus hasOneStatus() {
        String username = someUserName
        def statuses = component.submit(new ListTaskStatuses(username: username))
        assert statuses.size() == 1, "Expected one task statuses, got ${statuses.size()}: $statuses"
        return statuses.first()
    }

    List<TaskStatus> hasStatuses(int count) {
        String username = someUserName
        def statuses = component.submit(new ListTaskStatuses(username: username))
        assert statuses.size() == count, "Expected $count task statuses, got ${statuses.size()}: $statuses"
        return statuses
    }

}
