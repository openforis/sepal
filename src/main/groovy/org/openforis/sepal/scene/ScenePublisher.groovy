package org.openforis.sepal.scene

/**
 * Created by monzione on 14/07/2015.
 */
interface ScenePublisher {

    void publishScene(SceneRequest sceneRequest)

    void publishRequest(long requestId, String user, Collection<SceneReference> scenes)

    void register(SceneRetrievalListener... listeners)
}
