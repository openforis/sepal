package org.openforis.sepal.taskexecutor.gee

import groovyx.net.http.RESTClient

import static groovy.json.JsonOutput.toJson
import static groovyx.net.http.ContentType.*

interface GoogleEarthEngineGateway {
    String download(String name, Map image)

    Status status(String geeTaskId)

    void cancel(String geeTaskId)
}

class HttpGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final URI uri

    HttpGoogleEarthEngineGateway(URI uri) {
        this.uri = uri
    }

    String download(String name, Map image) {
        def response = http.post(
                path: 'download',
                requestContentType: URLENC,
                contentType: TEXT,
                body: [name: name, image: toJson(image)]
        )
        def geeTaskId = response.data.text
        return geeTaskId
    }

    Status status(String geeTaskId) {
        def response = http.get(
                path: 'status',
                contentType: JSON,
                query: [task: geeTaskId]
        )
        return new Status(
                state: response.data.state as Status.State,
                message: response.data.description)
    }

    void cancel(String geeTaskId) {
        http.post(path: 'cancel', query: [task: geeTaskId])
    }

    private RESTClient getHttp() {
        new RESTClient(uri)
    }
}