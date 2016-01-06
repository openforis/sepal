package org.openforis.sepal.scene

/**
 * Created by monzione on 14/07/2015.
 */
interface ScenePublisher {

    void publish(SceneRequest request)

    void publish(DownloadRequest request)

    void register(SceneRetrievalListener... listeners)
}
