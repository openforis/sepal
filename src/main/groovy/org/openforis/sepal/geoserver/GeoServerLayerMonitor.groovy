package org.openforis.sepal.geoserver

import org.openforis.sepal.SepalConfiguration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.util.FileSystem.toDir
import static org.openforis.sepal.util.FileSystem.toFile

class GeoServerLayerMonitor {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    static void start() {
        new Thread(new Runnable() {
            void run() {

                def homeDir = toDir(SepalConfiguration.instance.homeDir)

                def geoServer = new RestGeoServer(
                        SepalConfiguration.instance.style,
                        SepalConfiguration.instance.geoServerUrl,
                        SepalConfiguration.instance.geoServerUser,
                        SepalConfiguration.instance.geoServerPwd
                )

                def processingChain = new NativeProcessingChain(
                        toFile(SepalConfiguration.instance.processingChain)
                )

                def publisher = new Publisher(
                        homeDir,
                        toDir(SepalConfiguration.instance.targetDir),
                        SepalConfiguration.instance.layerFolderName,
                        processingChain,
                        geoServer
                )

                def fsMonitor = new FSMonitor(homeDir, publisher)

                fsMonitor.take()
            }
        }).start()
    }


}
