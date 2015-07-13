package org.openforis.sepal.scenesdownload

import groovy.transform.ToString
import org.openforis.sepal.sceneretrieval.provider.DataSet

import static org.openforis.sepal.scenesdownload.DownloadRequest.SceneStatus


@ToString
class RequestedScene {
    int id
    int requestId
    String sceneId
    DataSet dataSet
    Date lastUpdated
    SceneStatus status
    String processingChain
}
