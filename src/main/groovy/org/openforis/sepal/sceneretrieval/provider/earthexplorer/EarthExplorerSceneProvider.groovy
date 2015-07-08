package org.openforis.sepal.sceneretrieval.provider.earthexplorer

import org.openforis.sepal.sceneretrieval.provider.*
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
                                               String username,
                                               Collection<SceneReference> scenes) {
        def filteredList = scenes.findAll { SceneReference scene ->
            scene.dataSet == DataSet.LANDSAT_8
        }

        filteredList = filteredList.collect {
            def sceneRequest = new SceneRequest(requestId, it,username)
            def downloadLink = client.lookupDownloadLink(sceneRequest)
            if (downloadLink) {
                retrieveScene(sceneRequest, downloadLink)
                return it
            }
            return null
        }
        scenes.minus(filteredList)
    }

    private SceneReference retrieveScene(SceneRequest sceneRequest, String downloadLink) {
        executor.execute {
            coordinator.withScene(sceneRequest, 0d) { Scene scene ->
                client.download(sceneRequest, downloadLink) { InputStream inputStream ->
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
