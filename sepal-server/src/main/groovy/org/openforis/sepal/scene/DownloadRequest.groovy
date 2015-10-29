package org.openforis.sepal.scene

import groovy.transform.ToString


@ToString
class DownloadRequest implements Cloneable{

    int requestId
    String requestName
    String username
    Date requestTime
    Boolean groupScenes
    String processingChain
    List<SceneRequest> scenes = []
    Status status

}
