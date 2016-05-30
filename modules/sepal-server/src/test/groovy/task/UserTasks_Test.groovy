package task

class UserTasks_Test extends AbstractTaskTest {
    def 'Given no submitted task, when listing, no tasks are returned'() {
        when:
        def tasks = listTasks()

        then:
        tasks.empty
    }

    def 'Given a submitted task, when listing, one pending task is returned, with expected operation and params'() {
        def submittedTask = submitTask()

        when:
        def tasks = listTasks()

        then:
        tasks.size() == 1
        def task = tasks.first()
        task.pending
        task.operation == submittedTask.operation
        task.params == submittedTask.params
    }

    def 'Given an activated submitted task, when listing, one pending task is returned'() {
        activeTask()

        when:
        def tasks = listTasks()

        then:
        tasks.size() == 1
        tasks.first().active
    }

    def 'Given two tasks, one submitted on already active session, when listing, two active tasks are returned'() {
        activeTask()
        submitTask()

        when:
        def tasks = listTasks()

        then:
        tasks.size() == 2
        tasks.each {
            assert it.active
        }
    }

    def 'Given a canceled task, when listing, one canceled task is returned'() {
        canceledTask()

        when:
        def tasks = listTasks()

        then:
        tasks.size() == 1
        tasks.first().canceled
    }

    def 'Given a canceled timed out task, when listing, one failed task is returned'() {
        timedOutPendingTask()
        cancelTimedOutTasks()

        when:
        def tasks = listTasks()

        then:
        tasks.size() == 1
        tasks.first().failed
    }

    def 'Given two tasks for different users, when listing, one task is returned'() {
        activeTask()
        activeTask(username: 'another-username')

        when:
        def tasks = listTasks()

        then:
        tasks.size() == 1
    }
}
