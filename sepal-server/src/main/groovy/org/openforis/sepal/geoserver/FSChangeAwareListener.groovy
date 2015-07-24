package org.openforis.sepal.geoserver

import org.openforis.sepal.SepalConfiguration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.nio.file.*

import static java.nio.file.StandardWatchEventKinds.*
import static java.nio.file.WatchEvent.Kind
import static org.openforis.sepal.geoserver.FSChangeAwareListener.ResourceLevel.*

interface ChangeAwareListener {

}


class FSChangeAwareListener implements ChangeAwareListener {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    File homeDirectory
    Path homeDirectoryPath
    MonitorChangeHandler changeHandler
    WatchService watchService = FileSystems.getDefault().newWatchService()
    private final Map<WatchKey, Path> pathWatchers = [:]
    private final Map<Path, ResourceLevel> pathLevels = [:]

    private enum ResourceLevel {
        HOME, LAYER_CONTAINER, LAYER,
    }

    FSChangeAwareListener(File homeDirectory, MonitorChangeHandler changeHandler) {
        LOG.trace("New FS Monitor instance created for $homeDirectory.absolutePath")
        this.homeDirectory = homeDirectory
        this.homeDirectoryPath = homeDirectory.toPath()
        this.changeHandler = changeHandler
    }

    def registerHomeWatcher(Path homeDirPath) {
        LOG.debug("Going to register HomeDir Watcher at $homeDirPath")
        register(homeDirPath, HOME)
        File[] children = homeDirPath.toFile().listFiles()
        for (File child : children) {
            if (child.isDirectory()) {
                registerUserWatcher(child.toPath())
            }
        }
    }

    def registerUserWatcher(Path userDirPath) {
        LOG.trace("Going to register UserWatcher at $userDirPath")
        String[] layerDir = userDirPath.toFile().list(new FilenameFilter() {

            public boolean accept(File dir, String name) {
                return SepalConfiguration.instance.layerFolderName.equalsIgnoreCase(name)
            }
        })

        for (String dir : layerDir) {
            registerLayerContainerWatcher(userDirPath.resolve(dir))
        }
    }

    def registerLayerContainerWatcher(Path layerPath) {
        LOG.trace("Going to register LayerWatcher at $layerPath")
        register(layerPath, LAYER_CONTAINER)
        File[] layers = layerPath.toFile().listFiles()
        for (File layer : layers) {
            if (layer.isDirectory()) {
                registerLayerWatcher(layer.toPath())
            }
        }
    }

    def registerLayerWatcher(Path imageContainerPath) {
        LOG.trace("Going to register ImageContainerWatcher at $imageContainerPath")
        register(imageContainerPath, LAYER)
    }


    def register(Path dir, ResourceLevel resLevel = ResourceLevel.UNKNOWN) {
        LOG.debug("Goint to register $dir. ResourceLevel is $resLevel")
        WatchKey key = dir.register(
                watchService,
                ENTRY_CREATE,
                ENTRY_DELETE,
                ENTRY_MODIFY
        )
        pathWatchers.put(key, dir)
        pathLevels.put(dir, resLevel)
    }

    def unregister(Path path) {
        LOG.debug("Going to unregister $path")
        def watcher = pathWatchers.find { it.value.toAbsolutePath().equals(path.toAbsolutePath()) }
        if (watcher) {
            LOG.debug("Unregistering $watcher.key")
        }
    }

    def watch() {
        LOG.trace("Starting Watching FS for $homeDirectoryPath")
        registerHomeWatcher(homeDirectoryPath)
        while (!(Thread.currentThread().isInterrupted())) {
            waitForEvents()
        }
    }

    def waitForEvents() {
        WatchKey watchKey = null

        try {
            watchKey = watchService.take()
            for (WatchEvent event : watchKey.pollEvents()) {
                processWatchEvent(event, pathWatchers.get(watchKey))
            }
        } catch (Exception ex) {
            LOG.error("Error occured while waiting for FS events", ex)
        } finally {
            if (watchKey) {
                watchKey.reset()
            }
        }
    }


    def processWatchEvent(WatchEvent<Path> event, Path directoryInvolved) {
        Kind eventKind = event.kind()
        Path eventPath = event.context()
        ResourceLevel resLevel = pathLevels.get(directoryInvolved)
        LOG.debug("Event kind: $eventKind; Directory involved: $directoryInvolved;  resource name: $eventPath")
        Path resourcePath = directoryInvolved.resolve(eventPath)
        switch (resLevel) {
            case HOME:
                processHomeEvent(resourcePath, eventKind)
                break
            case LAYER_CONTAINER:
                processLayerContainerEvent(directoryInvolved, resourcePath, eventKind)
                break
            case LAYER:
                processLayerEvent(directoryInvolved, eventPath)
                break
        }
    }

    def processLayerEvent(Path layerFolder, Path targetResource) {
        if (!(LayerRepository.STORE_INDEX_NAME.equals(targetResource.toString()))) {
            Path layerFolderContainer = layerFolder.parent
            Path userHome = layerFolderContainer.parent
            String layerName = layerFolder.getFileName().toString()
            String userName = userHome.getFileName().toString()
            changeHandler.layerChanged(userName, layerName)
        }
    }

    def processLayerContainerEvent(Path layerPath, Path targetResource, Kind<Path> eventKind) {
        String userName = layerPath.parent.getFileName()
        String layerName = targetResource.getFileName().toString()
        switch (eventKind) {
            case ENTRY_CREATE:
                if (targetResource.toFile().isDirectory()) {
                    LOG.info("New layer folder has been created, $targetResource")
                    changeHandler.layerAdded(userName, layerName)
                    registerLayerWatcher(targetResource)
                }

                break
            case ENTRY_DELETE:
                LOG.info("Layer folder has been removed, $targetResource")
                changeHandler.layerRemoved(userName, layerName)
                unregister(targetResource)
                break
        }
    }

    def processHomeEvent(Path targetResource, Kind eventKind) {
        File targetResourceFile = targetResource.toFile()
        String username = targetResource.getFileName().toString()
        switch (eventKind) {
            case ENTRY_CREATE:
                if (targetResourceFile.isDirectory()) {
                    LOG.info("New user folder has been created, $targetResource")
                    changeHandler.userAdded(username)
                    registerUserWatcher(targetResource)
                }
                break
            case ENTRY_DELETE:
                changeHandler.userRemoved(username)
                LOG.info("User folder deleted, $targetResource")
                break
        }
    }

}
