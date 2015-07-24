package org.openforis.sepal.geoserver

import org.apache.commons.io.FileUtils
import org.apache.commons.io.IOUtils
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.Terminal

interface LayerRepository {

    public static final String STORE_INDEX_NAME = "storeIndex.properties"

    void checkLayerTargetContainer(String userName, String layerName)

    void checkUserTargetContainer(String userName)

    void checkUserHomeLayerContainer(String userName)

    void removeUserTargetContainer(String userName)

    void removeLayerTargetContainer(String userName, String layerName)

    List<String> getHomeUsers()

    List<String> getHomeUserLayers(String userName)

    void cleanTargetLayerContainer(String userName, String layerName)

    void storeLayerIndex(String userName, String layerName)

    void copyHomeContentToTarget(String userName, String layerName)

    Boolean applyProcessingChain(String userName, String layerName)

    String getTargetLayerLocation(String userName, String layerName)

    Boolean isLayerReady(String userName, String layerName)

    Boolean isLayerContentChanged(String userName, String layerName)

}

class FSLayerRepository implements LayerRepository {

    private final File targetDirectory
    private final File homeDirectory
    private final String homeUserLayersContainerDir
    private final String processingScript

    public FSLayerRepository(File targetDirectory, File homeDirectory, String homeUserLayersContainerDir, String processingScript) {
        this.targetDirectory = targetDirectory
        this.homeDirectory = homeDirectory
        this.homeUserLayersContainerDir = homeUserLayersContainerDir
        this.processingScript = processingScript
    }

    @Override
    List<String> getHomeUsers() {
        def users = []
        homeDirectory.eachFile { users.add(it.name) }
        return users
    }

    @Override
    List<String> getHomeUserLayers(String userName) {
        def layers = []
        File homeDir = getUserHomeLayerContainer(userName)
        homeDir.eachDir { layers.add(it.name) }
        return layers
    }

    @Override
    void checkLayerTargetContainer(String userName, String layerName) {
        getLayerTargetContainer(userName, layerName)
    }

    private File getLayerTargetContainer(String userName, String layerName) {
        File layerTargetFolder = new File(getUserTargetContainer(userName), layerName)
        FileSystem.mkDirs(layerTargetFolder)
        return layerTargetFolder
    }

    @Override
    void removeLayerTargetContainer(String userName, String layerName) {
        getLayerTargetContainer(userName, layerName).delete()
    }

    @Override
    void checkUserTargetContainer(String userName) {
        getUserTargetContainer(userName)
    }

    private File getUserTargetContainer(String userName) {
        File userTargetFolder = new File(targetDirectory, userName)
        FileSystem.mkDirs(userTargetFolder)
        return userTargetFolder
    }

    @Override
    void checkUserHomeLayerContainer(String userName) {
        getUserHomeLayerContainer(userName)
    }

    private File getUserHomeLayerContainer(String userName) {
        File userHomeDir = new File(homeDirectory, userName)
        File userHomeLayerDir = new File(userHomeDir, homeUserLayersContainerDir)
        FileSystem.mkDirs(userHomeLayerDir)
        return userHomeLayerDir
    }

    private File getUserHomeLayer(String userName, String layerName) {
        return new File(getUserHomeLayerContainer(userName), layerName)
    }

    @Override
    void removeUserTargetContainer(String userName) {
        File file = getUserTargetContainer(userName)
        FileUtils.deleteDirectory(file)
    }

    @Override
    void cleanTargetLayerContainer(String username, String layerName) {
        FileSystem.deleteDirContent(getLayerTargetContainer(username, layerName))
    }

    private File getStoreIndex(String userName, String layerName) {
        File layerDir = getUserHomeLayer(userName, layerName)
        return new File(layerDir, STORE_INDEX_NAME)
    }

    private Properties loadStoreIndex(String userName, String layerName) {
        Properties properties = null
        File storeIndexFile = getStoreIndex(userName, layerName)
        if (storeIndexFile.exists()) {
            properties = new Properties()
            FileInputStream fis = new FileInputStream(storeIndexFile)
            properties.load(fis)
            IOUtils.closeQuietly(fis)
        }
        return properties
    }

    @Override
    Boolean isLayerContentChanged(String userName, String layerName) {
        def changed = false
        Properties storeIndexProps = loadStoreIndex(userName, layerName)
        if (storeIndexProps) {
            File layerDir = getUserHomeLayer(userName, layerName)
            if (storeIndexProps.size() != layerDir.listFiles().size() - 1) {
                changed = true
            } else {
                layerDir.eachFile {
                    if (!(changed) && !(it.name.equals(STORE_INDEX_NAME))) {
                        if (!(storeIndexProps.containsKey(it.name))) {
                            changed = true
                        } else {
                            long timestampModified = Long.valueOf(storeIndexProps.getProperty(it.name))
                            long fileLastModified = it.lastModified()
                            changed = timestampModified == fileLastModified ? changed : true
                        }
                    }
                }
            }
        } else {
            changed = true
        }
        return changed
    }

    @Override
    void storeLayerIndex(String userName, String layerName) {
        Properties properties = new Properties()
        FileWriter fWriter = null
        File layerDir = getUserHomeLayer(userName, layerName)
        File propertiesFile = getStoreIndex(userName, layerName)
        if (propertiesFile.exists()) {
            propertiesFile.delete()
        }
        try {
            fWriter = new FileWriter(propertiesFile)
            layerDir.eachFile {
                // check each file but the storeIndex
                if (!(STORE_INDEX_NAME.equals(it.name))) {
                    properties.put(it.name, "" + it.lastModified())
                }
            }
            properties.store(fWriter, "StoreIndex")
        } finally {
            if (fWriter) {
                IOUtils.closeQuietly(fWriter)
            }
        }
    }

    @Override
    void copyHomeContentToTarget(String userName, String layerName) {
        def homeLayerDir = getUserHomeLayer(userName, layerName)
        def targetLayerDir = getLayerTargetContainer(userName, layerName)
        if (homeLayerDir.exists()) {
            homeLayerDir.eachFile {
                FileUtils.copyFileToDirectory(it, targetLayerDir)
            }
        }
    }

    @Override
    Boolean applyProcessingChain(String userName, String layerName) {
        def targetLayerDir = getLayerTargetContainer(userName, layerName)
        if (targetLayerDir.list()) {
            String targetLayerAbsPath = targetLayerDir.absolutePath
            Terminal.execute(targetLayerDir, processingScript, targetLayerAbsPath, targetLayerAbsPath)
        }
        return targetLayerDir.list()
    }

    @Override
    String getTargetLayerLocation(String userName, String layerName) {
        return getLayerTargetContainer(userName, layerName).absolutePath
    }

    @Override
    Boolean isLayerReady(String userName, String layerName) {
        return getLayerTargetContainer(userName, layerName).list()
    }


}