package org.openforis.sepal.scene

/**
 * Created by monzione on 14/07/2015.
 */
interface SceneProcessor {

    void process(SceneRequest downloadRequest)

    void process(DownloadRequest downloadRequest, String processingChain)

    void register(SceneRetrievalListener... listeners)
}
