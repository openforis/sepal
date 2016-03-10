package org.openforis.sepal.component.dataprovider.retrieval

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.component.dataprovider.*
import org.openforis.sepal.component.dataprovider.retrieval.provider.DispatchingSceneProvider
import org.openforis.sepal.component.dataprovider.retrieval.provider.FileSystemSceneContextProvider
import org.openforis.sepal.component.dataprovider.retrieval.provider.earthexplorer.EarthExplorerSceneProvider
import org.openforis.sepal.component.dataprovider.retrieval.provider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.component.dataprovider.retrieval.provider.s3landsat8.RestfulS3LandsatClient
import org.openforis.sepal.component.dataprovider.retrieval.provider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.NamedThreadFactory

import java.util.concurrent.Executors

import static org.openforis.sepal.util.FileSystem.toDir

class SceneRetrievalComponent {
    private final DispatchingSceneProvider sceneProvider
    private final SepalSceneProcessor sceneProcessor
    private final SepalScenePublisher scenePublisher
    private final FileSystemSceneContextProvider coordinator

    SceneRetrievalComponent(SepalConfiguration config) {
        def downloadWorkingDirectory = new File(config.downloadWorkingDirectory)
        def userHomePath = config.userDownloadDirTemplate()

        def sceneRepository = new FileSystemSceneRepository(downloadWorkingDirectory, userHomePath)
        coordinator = new FileSystemSceneContextProvider(sceneRepository)

        sceneProvider = new DispatchingSceneProvider([
                new S3Landsat8SceneProvider(
                        new RestfulS3LandsatClient('http://landsat-pds.s3.amazonaws.com/'),
                        new ExecutorServiceBasedJobExecutor(
                                Executors.newFixedThreadPool(100, NamedThreadFactory.singleThreadFactory('s3Landsat8Provider'))
                        ),
                        this.coordinator
                ),
                new EarthExplorerSceneProvider(
                        new RestfulEarthExplorerClient(
                                config.earthExplorerRestEndpoint,
                                config.earthExplorerUsername,
                                config.earthExplorerPassword
                        ),
                        new ExecutorServiceBasedJobExecutor(
                                Executors.newFixedThreadPool(
                                        config.maxConcurrentDownloads, NamedThreadFactory.singleThreadFactory('earthExplorerProvider')
                                )
                        ),
                        this.coordinator
                )
        ])

        sceneProcessor = new SepalSceneProcessor(
                sceneRepository,
                toDir(config.processingHomeDir)
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


    SceneRetrievalComponent registerRequestListener(DownloadRequestListener... listeners) {
        sceneProcessor.registerDownloadRequestListener(listeners)
        scenePublisher.registerDownloadRequestListener(listeners)
        return this
    }


    SceneRetrievalComponent register(SceneRetrievalListener... listeners) {
        coordinator.register(listeners)
        sceneProcessor.register(listeners)
        scenePublisher.register(listeners)
        sceneProvider.register(listeners)
        return this
    }

    void start() {

    }

    void stop() {

    }
}
