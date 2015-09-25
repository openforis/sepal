package endtoend

import fake.FakeEarthExplorer
import groovy.json.JsonOutput
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import org.openforis.sepal.scene.management.RequestScenesDownloadCommand
import org.openforis.sepal.transaction.SqlConnectionManager
import spock.util.concurrent.PollingConditions

class SepalDriver {
    private final system = new Sepal().init()
    private final RESTClient client = new RESTClient("http://localhost:$system.port/data/")

    final downloadWorkingDir = File.createTempDir('download', null)
    final homeDir = File.createTempDir('home', null)
    private FakeEarthExplorer fakeEarthExplorer

    SepalDriver() {
        client.handler.failure = { response, body ->
            throw new FailedRequest(response, body)
        }
    }

    SqlConnectionManager getSQLManager(){
        system.connectionManager
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

    HttpResponseDecorator sendDeleteRequest(Integer requestId) {
        client.delete(
                path: "downloadRequests/$requestId",
                requestContentType: 'application/json'
        ) as HttpResponseDecorator
    }

    HttpResponseDecorator sendDeleteRequestScene(Integer requestId, Integer sceneId) {
        client.delete(
                path: "downloadRequests/$requestId/$sceneId",
                requestContentType: 'application/json'
        ) as HttpResponseDecorator
    }

    SepalDriver withUsers(String... usernames) {
        usernames.each {
            system.database.addUser(it)
        }
        return this
    }

    SepalDriver withRequests(RequestScenesDownloadCommand... requests) {
        requests.each {
            system.database.addDownloadRequest(it)
        }
        return this
    }

    SepalDriver withMetadataProvider(int id, String name){
        system.database.addActiveMetadataProvider(id,name)
        return this
    }

    SepalDriver withActiveDataSets(int ... dataSetIds) {
        dataSetIds.each {
            system.database.addActiveDataSet(it)
        }
        return this
    }

    SepalDriver withActiveDataSet(int dataSetId, int metadataProviderId){
        system.database.addActiveDataSet(dataSetId,metadataProviderId)
        return this
    }

    void eventually(Closure callback) {
        new PollingConditions().eventually(callback)
    }

    void stop() {
        system.stop()
        fakeEarthExplorer?.stop()
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
