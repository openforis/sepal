package org.openforis.sepal.sceneretrieval

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.sceneretrieval.provider.*
import org.openforis.sepal.sceneretrieval.provider.earthexplorer.EarthExplorerSceneProvider
import org.openforis.sepal.sceneretrieval.provider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.sceneretrieval.provider.s3landsat8.RestfulS3LandsatClient
import org.openforis.sepal.sceneretrieval.provider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor

import java.util.concurrent.Executors

class SceneRetrievalComponent {
    final SceneProvider sceneProvider
    private final SceneDownloadCoordinator coordinator

    SceneRetrievalComponent(SceneRetrievalListener... listeners) {
        def downloadWorkingDirectory = new File(SepalConfiguration.instance.downloadWorkingDirectory)
        def userHomePath = SepalConfiguration.instance.getUserHomeDir()
        coordinator = new FileSystemSceneDownloadCoordinator(
                new FileSystemSceneRepository(downloadWorkingDirectory, userHomePath)
        )

        register(listeners)

        sceneProvider = new DispatchingSceneProvider([
                new S3Landsat8SceneProvider(
                        new RestfulS3LandsatClient('http://landsat-pds.s3.amazonaws.com/'),
                        new ExecutorServiceBasedJobExecutor(Executors.newCachedThreadPool()),
                        this.coordinator
                ),
                new EarthExplorerSceneProvider(
                        new RestfulEarthExplorerClient(),
                        new ExecutorServiceBasedJobExecutor(Executors.newFixedThreadPool(2)),
                        this.coordinator
                )
        ])
    }

    void register(SceneRetrievalListener... listeners) {
        coordinator.register(listeners)
    }

    void start() {

    }

    void stop() {

    }
}
