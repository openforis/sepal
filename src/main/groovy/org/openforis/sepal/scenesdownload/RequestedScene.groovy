package org.openforis.sepal.scenesdownload

import groovy.transform.ToString

@ToString
class RequestedScene {
    int sceneRequestId
    def downloadRequestId
    String sceneId
}
