package org.openforis.sepal.geoserver

interface ProcessingChain {
    File process(File image, File targetDir)
}
