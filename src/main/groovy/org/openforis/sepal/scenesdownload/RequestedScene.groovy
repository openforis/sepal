package org.openforis.sepal.scenesdownload

import groovy.transform.ToString

@ToString
class RequestedScene {
    int id
    def requestId
    def sceneId
    def dataSet
    def lastUpdated
    def status
    def processingChain
}
