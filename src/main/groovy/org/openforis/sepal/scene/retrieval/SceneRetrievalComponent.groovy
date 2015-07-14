package org.openforis.sepal.scene.retrieval

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.scene.SceneProvider
import org.openforis.sepal.scene.SceneRetrievalListener
import org.openforis.sepal.scene.SceneProcessor
import org.openforis.sepal.scene.retrieval.provider.*
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.EarthExplorerSceneProvider
import org.openforis.sepal.scene.retrieval.provider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.scene.retrieval.provider.s3landsat8.RestfulS3LandsatClient
import org.openforis.sepal.scene.retrieval.provider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.scene.ScenePublisher
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor

import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

import static java.util.concurrent.TimeUnit.*
import static org.openforis.sepal.util.FileSystem.toDir

class SceneRetrievalComponent {
    final SceneProvider sceneProvider
    final SceneProcessor sceneProcessor
    final ScenePublisher scenePublisher
    private final SceneContextProvider coordinator

    SceneRetrievalComponent() {
        def downloadWorkingDirectory = new File(SepalConfiguration.instance.downloadWorkingDirectory)
        def userHomePath = SepalConfiguration.instance.getUserHomeDir()

        def sceneRepository = new FileSystemSceneRepository(downloadWorkingDirectory, userHomePath)
        coordinator = new FileSystemSceneContextProvider(sceneRepository)

        sceneProvider = new DispatchingSceneProvider([
                new S3Landsat8SceneProvider(
                        new RestfulS3LandsatClient('http://landsat-pds.s3.amazonaws.com/'),
                        new ExecutorServiceBasedJobExecutor(
                                new ThreadPoolExecutor(10,50,10*60,SECONDS,new ArrayBlockingQueue<Runnable>(20))
                        ),
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
