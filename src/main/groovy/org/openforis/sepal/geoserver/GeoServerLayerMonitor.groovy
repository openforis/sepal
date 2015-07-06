package org.openforis.sepal.geoserver

import org.openforis.sepal.SepalConfiguration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class GeoServerLayerMonitor {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    void start() {
        new Thread(new Runnable() {
            void run() {
                LOG.info("Starting GeoServer Layer monitoring")
                def homeDir = dir(SepalConfiguration.instance.homeDir)
                def targetDir = dir(SepalConfiguration.instance.targetDir)
                def command = file(SepalConfiguration.instance.processingChain)
                def style = SepalConfiguration.instance.style
                def geoServerUrl = SepalConfiguration.instance.geoServerUrl
                def geoServerUserName = SepalConfiguration.instance.geoServerUser
                def geoServerPassword = SepalConfiguration.instance.geoServerPwd
                def layerFolderName = SepalConfiguration.instance.layerFolderName

                LOG.debug("HomeDir defined as $homeDir")
                LOG.debug("TargetDir defined as $targetDir")
                LOG.debug("Command defined as $command")
                LOG.debug("Style defined as $style")
                LOG.debug("GeoServerUrl defined as $geoServerUrl")
                LOG.debug("GeoServerUserName defined as $geoServerUserName")
                LOG.debug("LayerFolderName defined as $layerFolderName")
                def publisher = null
                try {
                    def processingChain = new NativeProcessingChain(command)
                    def geoServer = new RestGeoServer(style, geoServerUrl, geoServerUserName, geoServerPassword)
                    publisher = new Publisher(homeDir, targetDir, layerFolderName, processingChain, geoServer)
                } catch (Exception ex) {
                    LOG.error("Error on startup", ex)
                }

                def fsMonitor = new FSMonitor(homeDir, publisher)
                fsMonitor.take()
            }
        }).start()
    }

    private static File dir(String path) {
        def dir = file(path)
        if (!dir.isDirectory())
            illegalArgument("$dir is not a directory")
        return dir
    }

    private static File file(String path) {
        def file = new File(path)
        if (!file.exists())
            illegalArgument("$file does not exist")
        return file
    }

    private static void illegalArgument(String error) {
        LOG.error(error)
        System.exit(1)
    }
}
