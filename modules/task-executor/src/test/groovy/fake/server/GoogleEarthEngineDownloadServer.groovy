package fake.server

import groovy.json.JsonSlurper
import groovymvc.Controller
import org.openforis.sepal.taskexecutor.gee.Status

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.taskexecutor.gee.Status.State.ACTIVE

class GoogleEarthEngineDownloadServer extends TestServer {
    private final statuses = new LinkedList<Status>()
    private final File workingDir
    private Map image
    private int statusCheckCount
    private boolean canceled
    private File file

    GoogleEarthEngineDownloadServer(File workingDir) {
        this.workingDir = workingDir
    }

    void register(Controller controller) {
        controller.with {
            post('/download') {
                response.contentType = 'application/json'
                this.image = new JsonSlurper().parseText(params.required('image', String)) as Map
                def name = params.required('name', String)
                this.file = new File(new File(workingDir, name), name + '.tif')
                if (!statuses)
                    states(ACTIVE)
                send(UUID.randomUUID().toString())
            }

            get('/status') {
                response.contentType = 'text/plain'
                params.required('task', String)
                statusCheckCount++
                def status = statuses.size() > 1 ? statuses.poll() : statuses.peek()
                if (status.hasCompleted()) {
                    file.parentFile.mkdirs()
                    file.createNewFile()
                }
                send(toJson(state: status.state, description: status.message))
            }

            post('/cancel') {
                params.required('task', String)
                canceled = true
                response.status = 204
            }
        }
    }

    void states(Status.State... states) {
        this.statuses.clear()
        this.statuses.addAll(states.collect { new Status(state: it, message: it.name()) })
    }


    void requestedDownload(image) {
        assert this.image == image, "Expected a download request for Google Earth Engine task id $image " +
                "to have been made. Actually requested ${this.image}"
    }

    void checkedState(int count) {
        assert statusCheckCount == count
    }

    void canceled() {
        assert canceled
    }
}
