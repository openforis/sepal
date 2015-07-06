package org.openforis.sepal.sceneretrieval

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.dataprovider.DelegatingSceneProvider
import org.openforis.sepal.dataprovider.FileSystemSceneDownloadCoordinator
import org.openforis.sepal.dataprovider.FileSystemSceneRepository
import org.openforis.sepal.dataprovider.SceneProvider
import org.openforis.sepal.dataprovider.earthexplorer.EarthExplorerSceneProvider
import org.openforis.sepal.dataprovider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.dataprovider.s3landsat8.RestfulS3LandsatClient
import org.openforis.sepal.dataprovider.s3landsat8.S3Landsat8SceneProvider
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor

import java.util.concurrent.Executors

class SceneRetrievalComponent {
    final SceneProvider sceneProvider

    SceneRetrievalComponent() {
        def coordinator = new FileSystemSceneDownloadCoordinator(
                new FileSystemSceneRepository(new File(SepalConfiguration.instance.downloadWorkingDirectory))
        )

        sceneProvider = new DelegatingSceneProvider([
                new S3Landsat8SceneProvider(
                        new RestfulS3LandsatClient('http://landsat-pds.s3.amazonaws.com/'),
                        new ExecutorServiceBasedJobExecutor(Executors.newCachedThreadPool()),
                        coordinator
                ),
                new EarthExplorerSceneProvider(
                        new RestfulEarthExplorerClient(),
                        new ExecutorServiceBasedJobExecutor(Executors.newFixedThreadPool(2)()),
                        coordinator
                )
        ])
    }

    void start() {

    }

    void stop() {

    }
}
