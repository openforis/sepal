package org.openforis.sepal

import org.openforis.sepal.dataprovider.DataSet
import org.openforis.sepal.dataprovider.SceneProvider
import org.openforis.sepal.dataprovider.SceneReference
import org.openforis.sepal.scenesdownload.ScenesDownloadRepository

import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class PollingSceneRetriever {

    private final SceneProvider sceneProvider
    private final ScenesDownloadRepository scenesRepository
    private final ScheduledExecutorService executor


    PollingSceneRetriever(SceneProvider sceneProvider, ScenesDownloadRepository scenesRepository) {
        this.sceneProvider = sceneProvider
        this.scenesRepository = scenesRepository
        executor = Executors.newSingleThreadScheduledExecutor()
    }

    void start() {
        executor.schedule(new Job(), 10, TimeUnit.SECONDS)
    }

    void stop() {
        executor.shutdown()
        sceneProvider.stop()
    }

    private class Job implements Callable<Void> {

        @Override
        public Void call() throws Exception {
            def requests = scenesRepository.getNewDownloadRequests()
            requests.each { req ->
                def scenes = req.scenes.collect {
                    new SceneReference(it.sceneId, DataSet.byId(req.dataSetId))
                }
                sceneProvider.retrieve(req.requestId, scenes)
            }
            return null
        }


    }

}
