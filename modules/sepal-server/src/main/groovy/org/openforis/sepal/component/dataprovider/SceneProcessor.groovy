package org.openforis.sepal.component.dataprovider

interface SceneProcessor {

    void process(SceneRequest downloadRequest)

    void process(DownloadRequest downloadRequest, String processingChain)

    void register(SceneRetrievalListener... listeners)
}
