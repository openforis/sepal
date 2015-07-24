package org.openforis.sepal.geoserver

import org.openforis.sepal.SepalConfiguration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.util.FileSystem.toDir

class GeoServerLayerMonitor {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    static void start() {
        new Thread(new Runnable() {
            void run() {
                LOG.info('GeoServerLayerMonitor Started')

                def homeDir = toDir(SepalConfiguration.instance.homeDir)
                def targetDir = toDir(SepalConfiguration.instance.targetDir)
                def homeUserLayerDirContainer = SepalConfiguration.instance.layerFolderName
                def processingScript = SepalConfiguration.instance.processingChain

                def geoServerClient = new RestGeoServerClient(
                        SepalConfiguration.instance.style,
                        SepalConfiguration.instance.geoServerUrl,
                        SepalConfiguration.instance.geoServerUser,
                        SepalConfiguration.instance.geoServerPwd
                )

                def layerRepository = new FSLayerRepository(targetDir, homeDir, homeUserLayerDirContainer, processingScript)
                def monitorChangeHandler = new FSMonitorChangeHandler(layerRepository, geoServerClient)

                monitorChangeHandler.performCheck()
                new FSChangeAwareListener(homeDir, monitorChangeHandler).watch()
            }
        }).start()
    }


}
