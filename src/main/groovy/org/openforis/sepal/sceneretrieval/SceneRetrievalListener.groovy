package org.openforis.sepal.sceneretrieval

import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.SceneStatus

interface SceneRetrievalListener {

    void sceneStatusChanged(SceneRequest request, SceneStatus status)

}






