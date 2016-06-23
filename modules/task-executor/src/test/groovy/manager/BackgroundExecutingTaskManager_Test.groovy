package manager

import org.openforis.sepal.taskexecutor.api.BackgroundExecutor
import org.openforis.sepal.taskexecutor.api.InvalidTask
import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskExecution
import org.openforis.sepal.taskexecutor.api.TaskExecutor
import org.openforis.sepal.taskexecutor.api.TaskExecutorFactory
import org.openforis.sepal.taskexecutor.manager.BackgroundExecutingTaskManager
import spock.lang.Specification

@SuppressWarnings("GroovyAssignabilityCheck")
class BackgroundExecutingTaskManager_Test extends Specification {
    def taskExecutor = Mock(TaskExecutor)
    def taskExecution = Mock(TaskExecution)
    def backgroundExecutor = Mock(BackgroundExecutor) {
        execute(taskExecutor) >> taskExecution
    }
    def taskExecutorFactory = Mock(TaskExecutorFactory) {
        create(_ as Task) >> taskExecutor
    }
    def testId = 'some-id'
    def testOperation = 'some-operation'

    def 'When executing task with operation without factory, exception is thrown'() {

        when:
        taskManager().execute(task())
        then:
        thrown InvalidTask
    }

    def 'When executing task with null task, exception is thrown'() {
        when:
        taskManager(testOperation).execute(null)

        then:
        thrown IllegalArgumentException
    }

    def 'When executing task with factory, factory is created and task is executed in the background'() {
        def task = task(testOperation)

        when:
        taskManager(testOperation).execute(task)

        then:
        1 * taskExecutorFactory.create(task) >> taskExecutor
        1 * backgroundExecutor.execute(taskExecutor) >> taskExecution
    }

    def 'When canceling a non-existing task, no exception is thrown'() {
        when:
        taskManager().cancel('non-existing-task-id')
        then:
        notThrown Exception
    }

    def 'Given an executing task, when canceling task, task execution is canceled'() {
        def task = task(testOperation)
        def taskManager = taskManager(testOperation)
        taskManager.execute(task)

        when:
        taskManager.cancel(task.id)

        then:
        1 * taskExecution.cancel()
    }

    def 'Given an executing task, when executing same task, previous task execution is canceled'() {
        def task = task(testOperation)
        def taskManager = taskManager(testOperation)
        taskManager.execute(task)

        when:
        taskManager.execute(task)

        then:
        1 * taskExecution.cancel()
    }

    def 'Given an executing task, when stopping manager, task execution is canceled'() {
        def task = task(testOperation)
        def taskManager = taskManager(testOperation)
        taskManager.execute(task)

        when:
        taskManager.stop()

        then:
        1 * taskExecution.cancel()
    }

    private BackgroundExecutingTaskManager taskManager(String... operations) {
        def factoryByOperation = operations.collectEntries {
            [(it): taskExecutorFactory]
        }
        new BackgroundExecutingTaskManager(factoryByOperation, backgroundExecutor)
    }

    private Task task(String operation = testOperation) {
        new Task(id: testId, operation: operation, params: [:])
    }
}
