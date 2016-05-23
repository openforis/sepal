package task

import fake.Database
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.TaskComponent
import org.openforis.sepal.component.task.TaskStatus
import org.openforis.sepal.component.task.command.SubmitTask
import org.openforis.sepal.component.task.query.ListTaskStatuses
import sandboxmanager.FakeClock
import sandboxmanager.FakeHostingService
import sandboxmanager.FakeSandboxSessionProvider
import sandboxmanager.FakeWorkerInstanceProvider
import spock.lang.Ignore
import spock.lang.Specification

import static org.openforis.sepal.component.task.State.SUBMITTED

class TaskComponentTest extends Specification {
    def someUserName = 'some-username'

    def clock = new FakeClock()
    def instanceProvider = new FakeWorkerInstanceProvider(clock: clock)
    def database = new Database()
    def hostingService = new FakeHostingService(instanceProvider, clock, 0.3)
    def component = new TaskComponent(
            database.dataSource,
            hostingService,
            new FakeSandboxSessionProvider(clock),
            clock
    )

    def cleanup() {
        component.stop()
    }

    def 'Given no tasks have been submitted, when listing statuses, no statuses are returned'() {
        when:
        def tasks = listTaskStatuses()

        then:
        tasks.empty
    }

    def 'Given a submitted task, when listing statuses, one status is returned'() {
        def task = task()
        submit(task)

        when:
        def statuses = listTaskStatuses()

        then:
        statuses.size() == 1
        def status = statuses.first()
        status.username == someUserName
        status.state == SUBMITTED
        status.task == task
    }

    def 'When submitting a task, an instance is launched'() {
        when:
        submit(task())

        then:
        instanceProvider.launchedOne()
    }

    @Ignore
    def 'Given a submitted task, when submitting another, only one instance has been launched'() {
        submit(task())

        when:
        submit(task())

        then:
        instanceProvider.launchedOne()
    }


    void submit(Task task, String username = someUserName) {
        component.submit(new SubmitTask(username: username, task: task))
    }

    private Task task() {
        new Task(operation: 'someTask', data: [some: 'argument'])
    }

    List<TaskStatus> listTaskStatuses(String username = someUserName) {
        component.submit(new ListTaskStatuses(username: username))
    }
}
