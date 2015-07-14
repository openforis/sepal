package org.openforis.sepal.sceneretrieval

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.sceneretrieval.processor.SceneProcessor
import org.openforis.sepal.sceneretrieval.processor.SepalSceneProcessor
import org.openforis.sepal.sceneretrieval.provider.*
import org.openforis.sepal.sceneretrieval.provider.earthexplorer.EarthExplorerSceneProvider
import org.openforis.sepal.sceneretrieval.provider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.sceneretrieval.provider.s3landsat8.RestfulS3LandsatClient
import org.openforis.sepal.sceneretrieval.provider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.sceneretrieval.publisher.ScenePublisher
import org.openforis.sepal.sceneretrieval.publisher.SepalScenePublisher
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor

import java.util.concurrent.Executors

import static org.openforis.sepal.util.FileSystem.toDir

class SceneRetrievalComponent {
    final SceneProvider sceneProvider
    final SceneProcessor sceneProcessor
    final ScenePublisher scenePublisher
    private final SceneDownloadCoordinator coordinator

    SceneRetrievalComponent() {
        def downloadWorkingDirectory = new File(SepalConfiguration.instance.downloadWorkingDirectory)
        def userHomePath = SepalConfiguration.instance.getUserHomeDir()

        def sceneRepository = new FileSystemSceneRepository(downloadWorkingDirectory, userHomePath)
        coordinator = new FileSystemSceneDownloadCoordinator(sceneRepository)

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

        sceneProcessor = new SepalSceneProcessor(
                sceneRepository,
                toDir(SepalConfiguration.instance.processingHomeDir)
        )

        scenePublisher = new SepalScenePublisher(sceneRepository)
    }

    void register(SceneRetrievalListener... listeners) {
        coordinator.register(listeners)
        sceneProcessor.register(listeners)
        scenePublisher.register(listeners)
    }

    void start() {

    }

    void stop() {

    }
}
