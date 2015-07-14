package org.openforis.sepal.sceneretrieval.provider

import groovy.transform.ToString

@ToString
class SceneRequest {
    final long id
    final SceneReference sceneReference
    final String processingChain
    final String userName

    SceneRequest(long id, SceneReference sceneReference, String userName) {
        this(id, sceneReference, null, userName)
    }

    SceneRequest(long id, SceneReference sceneReference, String processingChain, String userName) {
        this.id = id
        this.sceneReference = sceneReference
        this.processingChain = processingChain
        this.userName = userName
    }
}



