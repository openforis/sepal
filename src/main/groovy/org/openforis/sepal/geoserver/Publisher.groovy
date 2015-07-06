package org.openforis.sepal.geoserver

import org.openforis.sepal.geoserver.io.GeoServerOutputFileFilter
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.nio.file.Files

class Publisher {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final File targetDir
    private final String relativeLayersPath
    private final ProcessingChain processingChain
    private final GeoServer geoServer
    private final Map<File, Layer> layers = [:]

    Publisher(File homeDir, File targetDir, String relativeLayersPath, ProcessingChain processingChain, GeoServer geoServer) {
        LOG.info("Publisher instance created for homeDir $homeDir")
        this.relativeLayersPath = relativeLayersPath
        this.processingChain = processingChain
        this.geoServer = geoServer
        this.targetDir = targetDir

        homeDir.eachDir { userDir ->
            setupUserDir(userDir)
        }
    }

    void userAdded(File userDir) {
        LOG.debug("A new user has been added")
        setupUserDir(userDir)
    }

    void userRemoved(File userDir) {
        def userName = userDir.name
        LOG.debug("Removing workspace for $userName")
        File targetUserDir = new File(targetDir, userName)
        if (targetUserDir.exists()) {
            targetUserDir.deleteDir()
        }
        geoServer.removeWorkspace(userName)

    }

    void layerAdded(String userName, File layerDir) {
        LOG.debug("A new layer has been added to $userName")
        setupLayer(userName, layerDir, Boolean.TRUE)
    }

    void imageAdded(String userName, File layerDir) {

        def layer = layers[layerDir]
        LOG.debug("A new image has been added to $layer.userLayerDir")
        layer.setup(processingChain, geoServer)
        layer.cleanOutputFiles()
        geoServer.publishStore(userName, layer.targetLayerDir)
        layer.saveTimestamps()
    }

    void imageRemoved(String userName, File layerDir, File image) {
        LOG.debug("An image has been removed from $layerDir")
        def layer = layers[layerDir]
        layer.removeTimestampEntry(image.name)
        layer.cleanOutputFiles()
        String[] files = layer.targetLayerDir.list(new FilenameFilter() {
            boolean accept(File dir, String name) {
                return name.equalsIgnoreCase(image.name)
            }
        })
        for (String file : files) {
            layer.targetLayerDir.toPath().resolve(file).toFile().delete()
            LOG.debug("$file removed from $layer.targetLayerDir")
        }

        geoServer.publishStore(userName, layer.targetLayerDir)
        layer.saveTimestamps()
    }

    void layerRemoved(String userName, File layerDir) {
        LOG.debug("Layer $layerDir has been removed from $userName")
        def layer = layers.remove(layerDir)
        layer?.remove(userName, layerDir, geoServer)
    }

    File layersDir(File userDir) {
        def layerDir = "$userDir/$relativeLayersPath"
        LOG.trace("User layer dir is $layerDir")
        File layerDirFile = new File(layerDir)
        LOG.trace(layerDirFile.exists() ? "Folder already exist" : "Folder need to be created")
        if (!(layerDirFile.exists())) {
            try {
                Files.createDirectory(layerDirFile.toPath())
            } catch (Exception ex) {
                LOG.warn("Error while creating $layerDir", ex)
            }
        }
        layerDirFile
    }

    private void setupUserDir(File userDir) {
        try {
            def userName = userDir.name
            LOG.debug("Checking user dir $userName")
            setupWorkspace(userName)
            def userLayersDir = layersDir(userDir)
            userLayersDir.eachDir { userLayerDir ->
                setupLayer(userName, userLayerDir)
            }
        } catch (Exception e) {
            LOG.error("Failed to setup user dir $userDir", e)
        }
    }

    private void setupLayer(String userName, File userLayerDir, Boolean layerAdded = false) {
        try {
            LOG.debug("Checking $userName layer dir $userLayerDir.absolutePath")
            Layer layer = layers[userLayerDir] ?: new Layer(userName, userLayerDir, targetDir)
            layers[userLayerDir] = layer
            def modified = layer.setup(processingChain, geoServer)
            if (modified || layerAdded) {
                LOG.debug("The layer should be republished")
                layer.cleanOutputFiles()
                if (checkLayer(layer.targetLayerDir)) {
                    LOG.debug("$layer.targetLayerDir is not empty. Creation on GeoServer is done immediatly")
                    geoServer.publishLayer(userName, layer.targetLayerDir)
                    layer.saveTimestamps()
                } else {
                    LOG.debug("$layer.targetLayerDir is empty. Creation on GeoServer is deferred")
                }

            }
        } catch (Exception e) {
            LOG.error("Failed to setup layer $userLayerDir", e)
        }
    }

    def checkLayer(File layerFolder) {
        LOG.trace("Going to see wheter $layerFolder.absolutePath is empty.")
        File[] files = layerFolder.listFiles(new GeoServerOutputFileFilter())
        return files.length > 0

    }

    private void setupWorkspace(String userName) {
        def targetUserDir = new File(targetDir, userName)
        LOG.debug("Looking for $targetUserDir")
        if (!targetUserDir.exists()) {
            LOG.debug("Directory does not exist on destination")
            targetUserDir.mkdir()
        } else {
            LOG.debug("Directory exist on destination")
        }
        geoServer.addWorkspace(userName)
    }

}
