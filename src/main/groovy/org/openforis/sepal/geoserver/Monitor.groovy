package org.openforis.sepal.geoserver

import org.openforis.sepal.geoserver.io.DirectoryMonitor
import org.openforis.sepal.geoserver.io.RecursivePathMonitor

import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap

class Monitor {
    private final DirectoryMonitor homeDirMonitor

    Monitor(File homeDir, Publisher publisher) {
        homeDirMonitor = new DirectoryMonitor(homeDir.toPath(), new HomeDirListener(homeDir, publisher))
    }

    void start() {
        homeDirMonitor.start()
        println 'Started'
    }

    void stop() {
        homeDirMonitor.stop()
        println 'Stopped'
    }

    static class HomeDirListener implements DirectoryMonitor.Listener {
        private final Publisher publisher
        private final ConcurrentHashMap<Path, RecursivePathMonitor> layersMonitors = new ConcurrentHashMap<>()

        HomeDirListener(File homeDir, Publisher publisher) {
            this.publisher = publisher
            homeDir.eachFile { userDir ->
                if (!userDir.name.startsWith('.'))
                    monitorLayers(userDir)
            }
        }

        void deletedRoot(Path dir) {
            def layerMonitorsToRemove = layersMonitors.findAll {
                it.key.parent == dir || it.key == dir
            }
            layerMonitorsToRemove.each {
                it.value.stop()
                layersMonitors.remove(it.key)
            }
        }

        void createdDir(Path userDir) {
            monitorLayers(userDir.toFile())
            publisher.userAdded(userDir.toFile())
        }

        private void monitorLayers(File userDir) {
            def layersDir = publisher.layersDir(userDir)
            layersDir.mkdirs()
            def layersPath = layersDir.toPath()
            def userName = userDir.name
            def layersMonitor = new RecursivePathMonitor(layersPath, new LayersListener(userName, layersPath, publisher))
            def existingMonitor = layersMonitors.putIfAbsent(layersPath, layersMonitor)
            if (!existingMonitor)
                layersMonitor.start()
        }


        void deletedPath(Path path) {
            def deletedMonitor = layersMonitors.remove(path)
            deletedMonitor?.stop()
        }
    }

    static class LayersListener implements RecursivePathMonitor.Listener {
        private final Publisher publisher
        private final String userName
        private final Path layersPath

        LayersListener(String userName, Path layersPath, Publisher publisher) {
            this.userName = userName
            this.layersPath = layersPath
            this.publisher = publisher
        }

        void createdPath(Path path) {
            pathUpdate(path)
        }

        void modifiedPath(Path path) {
            pathUpdate(path)
        }

        void deletedPath(Path path) {
            if (path.parent == layersPath)
                layerRemoved(path)
            else
                println "Deleted $path"
        }

        private void pathUpdate(Path path) {
            if (path.parent == layersPath && Files.isDirectory(path.parent))
                layerUpdated(path)
            else if (path.parent.parent == layersPath)
                layerUpdated(path.parent)
        }

        private void layerUpdated(Path layerPath) {
            publisher.layerUpdated(userName, layerPath.toFile())
        }

        private void layerRemoved(Path layerPath) {
            publisher.layerRemoved(userName, layerPath.toFile())
        }
    }
}
