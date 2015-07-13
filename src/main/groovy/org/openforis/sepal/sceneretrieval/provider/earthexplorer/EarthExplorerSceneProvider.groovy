package org.openforis.sepal.sceneretrieval.provider.earthexplorer

import org.openforis.sepal.sceneretrieval.provider.*
import org.openforis.sepal.util.JobExecutor


class EarthExplorerSceneProvider implements SceneProvider {
    private final EarthExplorerClient client
    private final JobExecutor executor
    private final SceneDownloadCoordinator coordinator


    EarthExplorerSceneProvider(EarthExplorerClient client, JobExecutor executor, SceneDownloadCoordinator coordinator) {
        this.client = client
        this.executor = executor
        this.coordinator = coordinator
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
        def availableScenes = requests.each { request ->
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
            coordinator.withScene(request) { Scene scene ->
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
