package fake

import org.openforis.sepal.taskexecutor.gee.GoogleEarthEngineGateway
import org.openforis.sepal.taskexecutor.gee.Status

import java.util.concurrent.ConcurrentHashMap

import static org.openforis.sepal.taskexecutor.gee.Status.State.ACTIVE

class FakeGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final statuses = new LinkedList<Status>()
    private String geeTaskId
    private int statusCheckCount
    private boolean cancelled

    void download(String geeTaskId) {
        this.geeTaskId = geeTaskId
        if (!statuses)
            states(ACTIVE)
    }

    Status status(String geeTaskId) {
        statusCheckCount++
        return statuses.size() > 1 ? statuses.poll() : statuses.peek()
    }

    void cancel(String geeTaskId) {
        cancelled = true
    }

    void states(Status.State... states) {
        this.statuses.clear()
        this.statuses.addAll(states.collect { new Status(state: it, message: it.name()) })
    }


    void requestedDownload(geeTaskId) {
        assert this.geeTaskId == geeTaskId, "Expected a download request for Google Earth Engine task id $geeTaskId " +
                "to have been made. Actually requested ${this.geeTaskId}"
    }

    void checkedState(int count) {
        assert statusCheckCount == count
    }

    void cancelled() {
        assert cancelled
    }
}
