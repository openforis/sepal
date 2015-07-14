package org.openforis.sepal.scene

/**
 * Created by monzione on 14/07/2015.
 */
interface SceneProcessor {

    void processScene(SceneRequest sceneRequest)

    void processRequest(long requestId, Collection<SceneReference> scenes, String processingScript)

    void register(SceneRetrievalListener... listeners)
}
