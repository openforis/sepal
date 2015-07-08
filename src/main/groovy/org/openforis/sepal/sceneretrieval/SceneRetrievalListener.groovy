package org.openforis.sepal.sceneretrieval

import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.scenesdownload.DownloadRequest.SceneStatus

interface SceneRetrievalListener {

    void sceneStatusChanged(SceneRequest request, SceneStatus status)

}






