package org.openforis.sepal.geoserver

import org.openforis.sepal.SepalConfiguration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.nio.file.*

class FSMonitor {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    File homeDirectory
    Path homeDirectoryPath
    Publisher publisher
    WatchService watchService
    private final Map<WatchKey, Path> keys
    private final Map<Path, ResourceLevel> pathLevels

    private enum ResourceLevel {
        HOME, WORKSPACE, LAYER, IMAGE, UNKNOWN
    }

    FSMonitor(File homeDirectory, Publisher publisher) {
        LOG.trace("New FS Monitor instance created for $homeDirectory.absolutePath")
        this.homeDirectory = homeDirectory
        this.homeDirectoryPath = homeDirectory.toPath()
        this.publisher = publisher
        watchService = FileSystems.getDefault().newWatchService()
        keys = [:]
        pathLevels = [:]
    }

    def registerHomeWatcher(Path homeDirPath) {
        LOG.trace("Going to register HomeDir Watcher at $homeDirPath")
        register(homeDirPath, ResourceLevel.HOME)
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
            registerLayerWatcher(userDirPath.resolve(dir))
        }
    }

    def registerLayerWatcher(Path layerPath) {
        LOG.trace("Going to register LayerWatcher at $layerPath")
        register(layerPath, ResourceLevel.LAYER)
        File[] layers = layerPath.toFile().listFiles()
        for (File layer : layers) {
            if (layer.isDirectory()) {
                registerImageWatcher(layer.toPath())
            }
        }
    }

    def registerImageWatcher(Path imageContainerPath) {
        LOG.trace("Going to register ImageContainerWatcher at $imageContainerPath")
        register(imageContainerPath, ResourceLevel.IMAGE)
    }


    def register(Path dir, ResourceLevel resLevel = ResourceLevel.UNKNOWN) {
        LOG.trace("Goint to register $dir. ResourceLevel is $resLevel")
        WatchKey key = dir.register(watchService, StandardWatchEventKinds.ENTRY_CREATE,
                StandardWatchEventKinds.ENTRY_DELETE, StandardWatchEventKinds.ENTRY_MODIFY)
        Path prev = keys.get(key)
        if (prev == null) {
            LOG.debug("$dir Registered")
        } else {
            if (!dir.equals(prev)) {
                LOG.debug("$dir Watcher updated")
            }
        }
        keys.put(key, dir)
        pathLevels.put(dir, resLevel)
    }

    def take() {
        Path homeDirPath = homeDirectory.toPath()
        LOG.trace("Starting Watching FS for $homeDirPath")
        registerHomeWatcher(homeDirPath)
        for (; ;) {
            LOG.trace("Listening for events")
            WatchKey wkey = watchService.take()
            Path dir = keys.get(wkey)
            LOG.debug("New event occurred: $dir")
            ResourceLevel resLevel = pathLevels.get(dir)
            LOG.debug("Resource level is $resLevel")
            for (WatchEvent<?> event : wkey.pollEvents()) {
                WatchEvent.Kind<?> kind = event.kind()
                LOG.debug("Event kind is $kind")
                WatchEvent<Path> ev = (WatchEvent<Path>) event
                Path filePath = dir.resolve(ev.context())
                LOG.debug("Full file path is $filePath")
                File pathFile = filePath.toFile()
                String workspaceName = filePath.getParent().getParent().fileName.toString()
                try {
                    switch (kind) {
                        case StandardWatchEventKinds.ENTRY_CREATE:
                            switch (resLevel) {
                                case ResourceLevel.WORKSPACE:
                                    publisher.userAdded(pathFile)
                                    registerUserWatcher(filePath)
                                    break
                                case ResourceLevel.LAYER:
                                    publisher.layerAdded(workspaceName, pathFile)
                                    registerImageWatcher(filePath)
                                    break
                                case ResourceLevel.IMAGE:
                                    workspaceName = filePath.getParent().getParent().getParent().fileName.toString()
                                    publisher.imageAdded(workspaceName, filePath.parent.toFile())
                            }
                            break
                        case StandardWatchEventKinds.ENTRY_DELETE:
                            switch (resLevel) {
                                case ResourceLevel.WORKSPACE:
                                    publisher.userRemoved(pathFile)
                                    break
                                case ResourceLevel.LAYER:
                                    publisher.layerRemoved(workspaceName, pathFile)
                                    break
                                case ResourceLevel.IMAGE:
                                    workspaceName = filePath.getParent().getParent().getParent().fileName.toString()
                                    publisher.imageRemoved(workspaceName, filePath.parent.toFile(), pathFile)
                                    break
                            }
                            break
                        case StandardWatchEventKinds.ENTRY_MODIFY:
                            switch (resLevel) {
                                case ResourceLevel.IMAGE:
                                    workspaceName = filePath.getParent().getParent().getParent().fileName.toString()
                                    publisher.imageAdded(workspaceName, filePath.parent.toFile())
                                    break
                            }
                    }
                } finally {
                    wkey.reset()
                }
            }
        }
    }
}
