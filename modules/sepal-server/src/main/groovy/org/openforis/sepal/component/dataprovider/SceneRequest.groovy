package org.openforis.sepal.component.dataprovider

import groovy.transform.ToString


@ToString
class SceneRequest {
    final long id
    final SceneReference sceneReference
    final String processingChain
    final Date lastUpdated
    final Status status
    DownloadRequest request

    SceneRequest(long id, SceneReference sceneReference, String processingChain, Date lastUpdated, Status status) {
        this.id = id
        this.sceneReference = sceneReference
        this.processingChain = processingChain
        this.lastUpdated = lastUpdated
        this.status = status
    }

    SceneRequest(long id, SceneReference sceneReference, String processingChain, Date lastUpdated, Status status, DownloadRequest request) {
        this(id, sceneReference, processingChain, lastUpdated, status)
        this.request = request
    }
}



