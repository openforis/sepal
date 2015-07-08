package endtoend

import fake.FakeEarthExplorer
import groovy.json.JsonOutput
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.scenesdownload.DownloadRequest
import org.openforis.sepal.scenesdownload.Downloader
import org.openforis.sepal.scenesdownload.RequestScenesDownload
import spock.util.concurrent.PollingConditions

import static org.openforis.sepal.SepalConfiguration.*

class SepalDriver {
    private final system = new Sepal().init()
    private final RESTClient client = new RESTClient("http://localhost:$system.port/data/")

    final downloadWorkingDir = File.createTempDir('download', null)
    final homeDir = File.createTempDir('home', null)
    private Downloader downloader
    private FakeEarthExplorer fakeEarthExplorer

    SepalDriver() {
        client.handler.failure = { response, body ->
            throw new FailedRequest(response, body)
        }
    }

    HttpResponseDecorator getDownloadRequests(String username) {
        client.get(path: "downloadRequests/$username") as HttpResponseDecorator
    }

    HttpResponseDecorator postDownloadRequests(Map downloadRequest) {
        client.post(
                path: "downloadRequests",
                body: new JsonOutput().toJson(downloadRequest),
                requestContentType: 'application/json'
        ) as HttpResponseDecorator
    }

    SepalDriver withUsers(String ... usernames) {
        usernames.each {
            system.database.addUser(it)
        }
        return this
    }

    SepalDriver withRequests(RequestScenesDownload... requests){
        requests.each {
            system.database.addDownloadRequest(it)
        }
    }

    SepalDriver withActiveDataSets(int ... dataSetIds) {
        dataSetIds.each {
            system.database.addActiveDataSet(it)
        }
        return this
    }

    SepalDriver startDownloader() {
        fakeEarthExplorer = new FakeEarthExplorer()
        configure([
                (DOWNLOADS_WORKING_DIRECTORY): downloadWorkingDir.absolutePath,
                (USER_HOME_DIR)              : "$homeDir.absolutePath/\$user" as String,
                (EARTHEXPLORER_REST_ENDPOINT): fakeEarthExplorer.url
        ])
        downloader = new Downloader()
        downloader.start()
        return this
    }

    void eventually(Closure callback) {
        new PollingConditions().eventually(callback)
    }

    void stop() {
        system.stop()
        fakeEarthExplorer?.stop()
        downloader?.stop()
    }

    private void configure(Map<String, String> configuration) {
        SepalConfiguration.instance.properties.putAll(configuration)
    }

}

class FailedRequest extends RuntimeException {
    final HttpResponseDecorator response
    final body

    FailedRequest(HttpResponseDecorator response, body) {
        super(body as String)
        this.body = body
        this.response = response
    }
}
