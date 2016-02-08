package endtoend

import fake.FakeEarthExplorer
import groovy.json.JsonOutput
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.transaction.SqlConnectionManager
import spock.util.concurrent.PollingConditions

class SepalDriver {
    final system = new Sepal().init()
    final RESTClient client = new RESTClient("http://localhost:$system.port/data/")
    FakeEarthExplorer fakeEarthExplorer
    def connectionManager = new SqlConnectionManager(system.database.dataSource)

    SepalDriver() {
        client.handler.failure = { response, body ->
            throw new FailedRequest(response, body)
        }
    }

    SepalConfiguration config = system.config

    void resetDatabase() {
        system.resetDatabase()
    }

    HttpResponseDecorator getDownloadRequests(String username) {
        getRequest("downloadRequests/$username")
    }

    HttpResponseDecorator getRequest(def path) {
        client.get(path: path) as HttpResponseDecorator
    }

    HttpResponseDecorator postRequest(def path, def body = null) {
        client.post(path: path, body: body) as HttpResponseDecorator
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

    SepalDriver withUser(String username, int userUid) {
        system.database.addUser(username, userUid)
        return this
    }


    SepalDriver withUsers(String... usernames) {
        usernames.each {
            system.database.addUser(it)
        }
        return this
    }

    SepalDriver withCrawlingCriteria(int providerId, String field, String expectedValue) {
        system.database.addCrawlingCriteria(providerId, field, expectedValue)
        return this
    }

    SepalDriver withMetadataProvider(int id, String name, Boolean active = true) {
        system.database.addMetadataProvider(id, name, '', active)
        return this
    }

    SepalDriver withActiveDataSets(int ... dataSetIds) {
        dataSetIds.each {
            system.database.addActiveDataSet(it)
        }
        return this
    }

    SepalDriver withActiveDataSet(int dataSetId, int metadataProviderId) {
        system.database.addActiveDataSet(dataSetId, metadataProviderId)
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
