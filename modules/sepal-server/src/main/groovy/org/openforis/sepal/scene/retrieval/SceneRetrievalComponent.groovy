package org.openforis.sepal.scene.retrieval

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.scene.*
import org.openforis.sepal.scene.retrieval.provider.DispatchingSceneProvider
import org.openforis.sepal.scene.retrieval.provider.FileSystemSceneContextProvider
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.EarthExplorerSceneProvider
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.scene.retrieval.provider.s3landsat8.RestfulS3LandsatClient
import org.openforis.sepal.scene.retrieval.provider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor

import java.util.concurrent.Executors

import static org.openforis.sepal.util.FileSystem.toDir

class SceneRetrievalComponent {
    private final DispatchingSceneProvider sceneProvider
    private final SepalSceneProcessor sceneProcessor
    private final SepalScenePublisher scenePublisher
    private final FileSystemSceneContextProvider coordinator

    SceneRetrievalComponent() {
        def downloadWorkingDirectory = new File(SepalConfiguration.instance.downloadWorkingDirectory)
        def userHomePath = SepalConfiguration.instance.getUserHomeDir()

        def sceneRepository = new FileSystemSceneRepository(downloadWorkingDirectory, userHomePath)
        coordinator = new FileSystemSceneContextProvider(sceneRepository)

        sceneProvider = new DispatchingSceneProvider([
                new S3Landsat8SceneProvider(
                        new RestfulS3LandsatClient('http://landsat-pds.s3.amazonaws.com/'),
                        new ExecutorServiceBasedJobExecutor(
                                Executors.newFixedThreadPool(100)
                        ),
                        this.coordinator
                ),
                new EarthExplorerSceneProvider(
                        new RestfulEarthExplorerClient(),
                        new ExecutorServiceBasedJobExecutor(Executors.newFixedThreadPool(SepalConfiguration.instance.maxConcurrentDownloads)),
                        this.coordinator
                )
        ])

        sceneProcessor = new SepalSceneProcessor(
                sceneRepository,
                toDir(SepalConfiguration.instance.processingHomeDir)
        )

        scenePublisher = new SepalScenePublisher(sceneRepository)
    }

    SceneProvider getSceneProvider() {
        return sceneProvider
    }

    SceneProcessor getSceneProcessor() {
        return sceneProcessor
    }

    ScenePublisher getScenePublisher() {
        return scenePublisher
    }


    void registerRequestListener(DownloadRequestListener... listeners) {
        sceneProcessor.registerDownloadRequestListener(listeners)
        scenePublisher.registerDownloadRequestListener(listeners)
    }


    void register(SceneRetrievalListener... listeners) {
        coordinator.register(listeners)
        sceneProcessor.register(listeners)
        scenePublisher.register(listeners)
        sceneProvider.register(listeners)
    }

    void start() {

    }

    void stop() {

    }
}
