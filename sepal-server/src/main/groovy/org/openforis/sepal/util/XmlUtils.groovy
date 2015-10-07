package org.openforis.sepal.util

import groovy.util.slurpersupport.GPathResult

class XmlUtils {

    static def nodeToMap(GPathResult node){
        node.children().collectEntries {
            [ it.name(), it.childNodes() ? nodeToMap(it) : it.text() ]
        }
    }

    static def getAllNodeWithTagName(InputStream xmlFile, String nodeName){
        new XmlSlurper().parse(xmlFile).depthFirst().findAll { it.name() == nodeName}
    }


}
