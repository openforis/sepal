package org.openforis.sepal.sceneretrieval.provider.s3landsat8

import org.openforis.sepal.sceneretrieval.provider.*
import org.openforis.sepal.util.JobExecutor

class S3Landsat8SceneProvider implements SceneProvider {
    private final S3LandsatClient client
    private final JobExecutor executor
    private final SceneDownloadCoordinator coordinator

    S3Landsat8SceneProvider(S3LandsatClient client, JobExecutor executor, SceneDownloadCoordinator coordinator) {
        this.client = client
        this.executor = executor
        this.coordinator = coordinator
    }

    Collection<SceneReference> retrieve(long requestId,String username, Collection<SceneReference> scenes) {
        def indexByScene = loadSceneIndexes(scenes)
        indexByScene.each { scene, index ->
            retrieveScene(index, new SceneRequest(requestId, scene,username))
        }

        def notRetrieved = scenes.minus(indexByScene.keySet())
        return notRetrieved
    }

    private void retrieveScene(SceneIndex index, SceneRequest request) {
        executor.execute {
            coordinator.withScene(request, index.sizeInBytes) { Scene scene ->
                index.entries.each { entry ->
                    client.download(entry) { InputStream entryStream ->
                        scene.add(
                                new FileStream(entryStream, entry.fileName, entry.sizeInBytes)
                        )
                    }
                }
            }
        }
    }


    private LinkedHashMap<SceneReference, SceneIndex> loadSceneIndexes(Collection<SceneReference> scenes) {
        Map<SceneReference, SceneIndex> indexByScene = [:]
        scenes.findAll {
            it.dataSet == DataSet.LANDSAT_8
        }.each {
            def index = client.index(it.id)
            if (index)
                indexByScene[it] = index
        }
        return indexByScene
    }

    @Override
    public void stop() {
        executor.stop()
    }
}

