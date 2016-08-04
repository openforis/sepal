package fake.server

import groovymvc.Controller
import org.openforis.sepal.taskexecutor.gee.Status

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.taskexecutor.gee.Status.State.ACTIVE

class GoogleEarthEngineDownloadServer extends TestServer {
    private final statuses = new LinkedList<Status>()
    private String geeTaskId
    private int statusCheckCount
    private boolean cancelled
    private File file

    GoogleEarthEngineDownloadServer(File workingDir) {
        file = new File(workingDir, 'some-filename')
    }

    void register(Controller controller) {
        controller.with {
            post('/download') {
                this.geeTaskId = params.required('task', String)
                if (!statuses)
                    states(ACTIVE)
                response.status = 204
            }

            get('/status') {
                response.contentType = 'application/json'
                params.required('task', String)
                statusCheckCount++
                def status = statuses.size() > 1 ? statuses.poll() : statuses.peek()
                if (status.hasCompleted())
                    file.createNewFile()
                send(toJson(state: status.state, description: status.message, filename: file.name))
            }

            post('/cancel') {
                params.required('task', String)
                cancelled = true
                response.status = 204
            }
        }
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
