package org.openforis.sepal.geoserver

import org.openforis.sepal.geoserver.io.GeoServerOutputFileFilter
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class Layer {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String userName
    private final File userLayerDir
    private final File targetLayerDir
    private final Properties timestamps

    Layer(String userName, File userLayerDir, File targetDir) {
        this.userName = userName
        this.userLayerDir = userLayerDir
        this.targetLayerDir = new File("$targetDir/$userName/$userLayerDir.name")
        targetLayerDir.mkdirs()
        LOG.trace("Creating a layer wrapper for $userName:$userLayerDir.name")
        this.timestamps = loadTimestamps(targetLayerDir)
    }

    int getTimestampsEntries() {
        return this.timestamps.keySet.size()
    }

    int targetLayerDirEntries() {
        return this.targetLayerDir.listFiles().length
    }

    void remove(String user, File layerDir, GeoServer geoServer) {

        targetLayerDir.deleteDir()
        geoServer.removeLayer(user, layerDir.name)
    }

    Boolean setup(ProcessingChain processingChain, GeoServer geoServer) {
        LOG.debug("Going to check layer $userLayerDir content")
        Set<File> modifiedFiles = userLayerDir.listFiles().findAll { modified(it) }
        modifiedFiles.each { file ->
            process(file, processingChain)
        }
        modifiedFiles
    }

    def cleanOutputFiles() {
        LOG.trace("Layer dir should be cleaned")
        File[] filesToClean = targetLayerDir.listFiles(new GeoServerOutputFileFilter(true))
        for (File fileToClean : filesToClean) {
            fileToClean.delete()
            LOG.trace("$fileToClean.name has been deleted")
        }
    }

    private void process(File file, ProcessingChain processingChain) {
        try {
            LOG.trace("Going to process $file.absolutePath")
            processingChain.process(file, targetLayerDir)
            LOG.trace("Going to store entry on timestamp file $file.name: file.lastModified")
            timestamps.setProperty(file.name, file.lastModified() as String)
        } catch (Exception e) {
            LOG.error("Failed to process $file", e)
        }
    }

    private boolean modified(File file) {

        LOG.trace("Working with $file.absolutePath")
        if (file.isHidden()) {
            LOG.trace("$file.absolutePath is hidden")
            return false
        }

        def timestamp = timestamps.getProperty(file.name)
        def lastModified = file.lastModified()
        LOG.trace("Trying to identify last upload time")
        if (timestamp == null) {
            LOG.trace("$file.absolutePath not available on timestamps.properties")
        } else {
            LOG.debug("Registered timestamp $timestamp File last update time $lastModified")
        }

        !timestamp || (timestamp as long) < lastModified

    }


    private void saveTimestamps() {
        def timestampsFile = new File(targetLayerDir, 'timestamps.properties')
        timestamps.store(timestampsFile.newWriter(), null)
        LOG.debug("Timestamp informations succesfully stored on $timestampsFile.absolutePath")
    }


    void removeTimestampEntry(String fileName) {
        timestamps.remove(fileName)
    }

    private Properties loadTimestamps(File targetLayerDir) {
        LOG.trace("Going to load timestamp file")
        def timestamps = new Properties()
        def timestampsFile = new File(targetLayerDir, 'timestamps.properties')
        if (timestampsFile.exists()) {
            LOG.trace("TimeStamp file found")
            timestamps.load(timestampsFile.newDataInputStream())
        } else {
            LOG.trace("TimeStamp file not found")
        }

        return timestamps
    }
}
