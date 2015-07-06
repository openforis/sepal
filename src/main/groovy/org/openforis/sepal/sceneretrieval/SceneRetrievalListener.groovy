package org.openforis.sepal.sceneretrieval

import org.openforis.sepal.scenesdownload.DownloadRequest.RequestStatus;

interface SceneRetrievalListener {

    void sceneStatusChanged(long requestId, String sceneId, RequestStatus status)

}


