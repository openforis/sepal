package org.openforis.sepal.dataprovider.earthexplorer

import org.openforis.sepal.dataprovider.*
import org.openforis.sepal.util.JobExecutor
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class EarthExplorerSceneProvider implements SceneProvider {

    private static Logger LOG = LoggerFactory.getLogger(this)

    private final EarthExplorerClient client
    private final JobExecutor executor
    private final SceneDownloadCoordinator coordinator

    EarthExplorerSceneProvider(EarthExplorerClient client, JobExecutor executor, SceneDownloadCoordinator coordinator) {
        this.client = client
        this.executor = executor
        this.coordinator = coordinator
    }

    @Override
    public Collection<SceneReference> retrieve(long requestId,
                                               Collection<SceneReference> scenes) {
        def filteredList = scenes.findAll { SceneReference scene ->
            scene.dataSet == DataSet.LANDSAT_8
        }
        filteredList.each { SceneReference reference ->
            retrieveScene(new SceneRequest(requestId, reference))
        }
        scenes.minus(filteredList)
    }

    SceneReference retrieveScene(SceneRequest sceneRequest) {
        executor.execute {
            coordinator.withScene(sceneRequest, 0d) { Scene scene ->
                client.download(sceneRequest) { InputStream inputStream ->
                    scene.addArchive(new FileStream(inputStream, sceneRequest.sceneReference.id + ".tar.gz", 0d))
                }

            }
        }
    }

    @Override
    public void stop() {
        executor.stop()
    }
}
