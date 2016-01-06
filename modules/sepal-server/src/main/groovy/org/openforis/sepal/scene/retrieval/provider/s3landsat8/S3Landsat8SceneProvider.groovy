package org.openforis.sepal.scene.retrieval.provider.s3landsat8

import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.SceneProvider
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.retrieval.provider.FileStream
import org.openforis.sepal.scene.retrieval.provider.Scene
import org.openforis.sepal.scene.retrieval.provider.SceneContextProvider
import org.openforis.sepal.util.JobExecutor

import static org.openforis.sepal.scene.retrieval.provider.s3landsat8.SceneIndex.Entry

class S3Landsat8SceneProvider implements SceneProvider {
    private final S3LandsatClient client
    private final JobExecutor executor
    private final SceneContextProvider sceneContextProvider

    S3Landsat8SceneProvider(S3LandsatClient client, JobExecutor executor, SceneContextProvider sceneContextProvider) {
        this.client = client
        this.executor = executor
        this.sceneContextProvider = sceneContextProvider
    }

    @Override
    Collection<SceneRequest> retrieve(List<SceneRequest> requests) {
        def indexByRequest = loadSceneIndexes(requests)
        indexByRequest.each { request, index ->
            retrieveScene(index, request)
        }

        def notRetrieved = requests.minus(indexByRequest.keySet())
        return notRetrieved
    }

    private void retrieveScene(SceneIndex index, SceneRequest request) {
        executor.execute {
            sceneContextProvider.withScene(request, index.sizeInBytes) { Scene scene ->
                downloadFilesForScene(scene, index)
            }
        }
    }

    private void downloadFilesForScene(Scene scene, SceneIndex index) {
        def jobs = index.entries.collect { entry ->
            return {
                client.download(entry) { InputStream entryStream ->
                    def fileStream = toFileStream(entryStream, entry)
                    scene.addFile(fileStream)
                }
            }
        }
        executor.executeAllAndWait(jobs)
    }

    private static FileStream toFileStream(InputStream entryStream, Entry entry) {
        new FileStream(entryStream, entry.fileName, entry.sizeInBytes)
    }


    private Map<SceneRequest, SceneIndex> loadSceneIndexes(List<SceneRequest> requests) {
        Map<SceneRequest, SceneIndex> indexByRequest = [:]
        requests.findAll {
            it.sceneReference.dataSet == DataSet.LANDSAT_8
        }.each {
            def index = client.index(it.sceneReference.id)
            if (index)
                indexByRequest[it] = index
        }
        return indexByRequest
    }

    @Override
    public void stop() {
        executor.stop()
    }

}

