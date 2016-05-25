package task

import groovy.transform.Immutable
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.Task
import org.openforis.sepal.component.task.TaskExecutorGateway
import org.openforis.sepal.component.task.event.TaskCanceled
import org.openforis.sepal.event.EventDispatcher

class FakeTaskExecutorGateway implements TaskExecutorGateway {
    private final List<ExecutionRequest> executed = []
    private final List<ExecutionRequest> canceled = []
    private final EventDispatcher eventDispatcher

    FakeTaskExecutorGateway(EventDispatcher eventDispatcher) {
        this.eventDispatcher = eventDispatcher
    }

    void execute(Task task, Instance instance) {
        executed << new ExecutionRequest(task, instance)
    }

    void cancel(Task task, Instance instance) {
        canceled << new ExecutionRequest(task, instance)
        eventDispatcher.publish(new TaskCanceled(task: task, instance: instance))
    }

    void executedNone() {
        assert executed.empty,
                "Expected no task to be executed. Actually executed ${executed.size()}: ${executed}"
    }

    ExecutionRequest executedOne() {
        assert executed.size() == 1,
                "Expected one task to be executed. Actually executed ${executed.size()}: ${executed}"
        return executed.first()
    }

    List<ExecutionRequest> executed(int count) {
        assert executed.size() == count,
                "Expected $count tasks to be executed. Actually executed ${executed.size()}: ${executed}"
        return executed.asImmutable()
    }

}

@Immutable
class ExecutionRequest {
    Task task
    Instance instance
}
