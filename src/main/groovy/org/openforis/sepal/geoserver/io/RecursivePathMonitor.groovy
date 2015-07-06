package org.openforis.sepal.geoserver.io

import name.mitterdorfer.perlock.PathChangeListener
import name.mitterdorfer.perlock.PathWatcher
import name.mitterdorfer.perlock.PathWatcherFactory

import java.nio.file.Path
import java.util.concurrent.Executors

class RecursivePathMonitor {
    private final executorService = Executors.newSingleThreadExecutor()
    private final Path rootDir
    private final PathWatcher watcher

    RecursivePathMonitor(Path rootDir, Listener listener) {
        this.rootDir = rootDir
        def pathWatchers = new PathWatcherFactory(executorService)
        watcher = pathWatchers.createRecursiveWatcher(rootDir, adapt(listener))
    }

    private PathChangeListener adapt(Listener listener) {
        new PathChangeListener() {
            void onPathCreated(Path path) {
                try {
                    if (!excluded(path))
                        listener.createdPath(path)
                } catch (Exception e) {
                    e.printStackTrace() // TODO: Proper error handling
                }
            }

            void onPathModified(Path path) {
                try {
                    if (!excluded(path))
                        listener.modifiedPath(path)
                } catch (Exception e) {
                    e.printStackTrace() // TODO: Proper error handling
                }
            }

            void onPathDeleted(Path path) {
                try {
                    if (!excluded(path))
                        listener.deletedPath(path)
                } catch (Exception e) {
                    e.printStackTrace() // TODO: Proper error handling
                }
            }
        }
    }

    void start() {
        watcher.start()
    }

    void stop() {
        watcher.stop()
    }

    private boolean excluded(Path path) {
        path.toFile().name.startsWith('.')
    }

    interface Listener {
        void createdPath(Path path)

        void modifiedPath(Path path)

        void deletedPath(Path path)
    }

}
