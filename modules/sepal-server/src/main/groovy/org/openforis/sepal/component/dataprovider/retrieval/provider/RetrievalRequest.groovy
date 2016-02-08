package org.openforis.sepal.component.dataprovider.retrieval.provider

import org.openforis.sepal.component.dataprovider.SceneReference

class RetrievalRequest {
    final String requestId
    final Collection<SceneReference> scenes
    final String userId
    final Date timestamp

    RetrievalRequest(String requestId, Collection<SceneReference> scenes, String userId, Date timestamp) {
        this.requestId = requestId
        this.scenes = Collections.unmodifiableCollection(scenes)
        this.userId = userId
        this.timestamp = timestamp
    }
}
