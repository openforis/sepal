package org.openforis.sepal.scene.retrieval.provider.earthexplorer

import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.SceneProvider
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.retrieval.provider.*
import org.openforis.sepal.util.JobExecutor


class EarthExplorerSceneProvider implements SceneProvider {
    private final EarthExplorerClient client
    private final JobExecutor executor
    private final SceneContextProvider sceneContextProvider


    EarthExplorerSceneProvider(EarthExplorerClient client, JobExecutor executor, SceneContextProvider sceneContextProvider) {
        this.client = client
        this.executor = executor
        this.sceneContextProvider = sceneContextProvider
    }

    private Map<String, SceneRequest> filterRequests(List<SceneRequest> requests) {
        findAvailableScenes(filterDataSet(requests))
    }

    private List<SceneRequest> filterDataSet(List<SceneRequest> requests) {
        requests.findAll { SceneRequest request ->
            request.sceneReference.dataSet == DataSet.LANDSAT_8
            // TODO: Add all data sets supported by earth explorer
        }
    }

    private Map<String, SceneRequest> findAvailableScenes(List<SceneRequest> requests) {
        def scenesMap = [:]
        requests.each { request ->
            def downloadLink = client.lookupDownloadLink(request)
            if (downloadLink) {
                scenesMap.put(downloadLink, request)
            }
        }
        return scenesMap
    }

    @Override
    Collection<SceneRequest> retrieve(List<SceneRequest> requests) {
        def filteredList = filterRequests(requests)
        filteredList.each {
            retrieveScene(it.value, it.key)
        }
        requests.minus(filteredList.values())
    }

    private void retrieveScene(SceneRequest request, String downloadLink) {
        executor.execute {
            sceneContextProvider.withScene(request) { Scene scene ->
                downloadSceneArchive(scene, request, downloadLink)
            }
        }
    }

    private downloadSceneArchive(scene, SceneRequest request, String downloadLink) {
        client.download(request, downloadLink) { InputStream inputStream, double size ->
            scene.addArchive(toFileStream(inputStream, request, size))
        }
    }

    private FileStream toFileStream(InputStream inputStream, SceneRequest request, double size) {
        new FileStream(inputStream, request.sceneReference.id + ".tar.gz", size)
    }

    @Override
    public void stop() {
        executor.stop()
    }
}
