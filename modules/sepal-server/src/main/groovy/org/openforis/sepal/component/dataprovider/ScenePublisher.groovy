package org.openforis.sepal.component.dataprovider

interface ScenePublisher {

    void publish(SceneRequest request)

    void publish(DownloadRequest request)

    void register(SceneRetrievalListener... listeners)
}
