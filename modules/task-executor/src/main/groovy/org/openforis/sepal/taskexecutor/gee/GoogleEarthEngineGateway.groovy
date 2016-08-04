package org.openforis.sepal.taskexecutor.gee

import groovyx.net.http.RESTClient

import static groovyx.net.http.ContentType.JSON

interface GoogleEarthEngineGateway {
    void download(String geeTaskId)

    Status status(String geeTaskId)

    void cancel(String geeTaskId)
}

class HttpGoogleEarthEngineGateway implements GoogleEarthEngineGateway {

    private final URI uri

    HttpGoogleEarthEngineGateway(URI uri) {
        this.uri = uri
    }

    void download(String geeTaskId) {
        http.post(path: 'download', query: [task: geeTaskId])
    }

    Status status(String geeTaskId) {
        def response = http.get(path: 'status', query: [task: geeTaskId], contentType: JSON)
        return new Status(
                state: response.data.state as Status.State,
                message: response.data.description,
                filename: response.data.filename)
    }

    void cancel(String geeTaskId) {
        http.post(path: 'cancel', query: [task: geeTaskId])
    }

    private RESTClient getHttp() {
        new RESTClient(uri)
    }
}