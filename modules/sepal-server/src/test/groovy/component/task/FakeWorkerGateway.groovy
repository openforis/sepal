package component.task

import groovy.transform.Immutable
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession

class FakeWorkerGateway implements WorkerGateway {
    private final Map<String, ExecutionRequest> requestByTaskId = [:]
    private final List<ExecutionRequest> canceledRequests = []

    void execute(Task task, WorkerSession session) {
        requestByTaskId[task.id] = new ExecutionRequest(task, session)
    }

    void cancel(String taskId, WorkerSession session) {
        def removed = requestByTaskId.remove(taskId)
        canceledRequests << removed
        assert removed, "No execution request for task $taskId"
        assert session.id == removed.session.id, "Session of execution request and cancel request does not match: " +
                "$removed.session.id != $session.id"
    }

    List<ExecutionRequest> executedTwo() {
        assert requests.size() == 2,
                "Expected two execution request. Actually requested ${requests.size()}: ${requests}"
        return requests
    }

    private List<ExecutionRequest> getRequests() {
        requestByTaskId.values().toList()
    }

    void canceledNone() {
        assert canceledRequests.empty,
                "Expected no canceled execution request. Actually canceled ${canceledRequests.size()}: ${canceledRequests}"
    }

    ExecutionRequest canceledOne() {
        assert canceledRequests.size() == 1,
                "Expected one canceled execution request. Actually canceled ${canceledRequests.size()}: ${canceledRequests}"
        return canceledRequests.first()
    }

    List<ExecutionRequest> canceledTwo() {
        assert canceledRequests.size() == 2,
                "Expected two canceled execution request. Actually canceled ${canceledRequests.size()}: ${canceledRequests}"
        return canceledRequests
    }
}

@Immutable
class ExecutionRequest {
    Task task
    WorkerSession session
}
