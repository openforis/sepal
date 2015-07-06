package org.openforis.sepal.geoserver.io

import name.mitterdorfer.perlock.AbstractPathChangeListener
import name.mitterdorfer.perlock.PathChangeListener
import name.mitterdorfer.perlock.PathWatcher
import name.mitterdorfer.perlock.PathWatcherFactory

import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.Executors

class DirectoryMonitor {
    private final executorService = Executors.newSingleThreadExecutor()
    private final Path rootDir
    private final PathWatcher watcher

    DirectoryMonitor(Path rootDir, Listener listener) {
        this.rootDir = rootDir
        def pathWatchers = new PathWatcherFactory(executorService)
        watcher = pathWatchers.createNonRecursiveWatcher(rootDir, adapt(listener))
    }

    private PathChangeListener adapt(Listener listener) {
        new AbstractPathChangeListener() {
            void onPathCreated(Path path) {
                try {
                    if (Files.isDirectory(path) && !excluded(path))
                        listener.createdDir(path)
                } catch (Exception e) {
                    e.printStackTrace() // TODO: Proper error handling
                }
            }

            void onPathDeleted(Path path) {
                try {
                    if (excluded(path))
                        return
                    if (path == rootDir)
                        listener.deletedRoot(rootDir)
                    else
                        listener.deletedPath(path)
                } catch (Exception e) {
                    e.printStackTrace() // TODO: Proper error handling
                }
            }
        }
    }

    boolean excluded(Path path) {
        path.toFile().name.startsWith('.')
    }

    void start() {
        watcher.start()
    }

    void stop() {
        watcher.stop()
    }

    interface Listener {
        void deletedRoot(Path rootDir)

        void createdDir(Path dir)

        void deletedPath(Path path)
    }
}
