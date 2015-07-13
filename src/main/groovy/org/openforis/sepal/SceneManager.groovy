package org.openforis.sepal

import org.openforis.sepal.sceneretrieval.SceneRetrievalListener

import org.openforis.sepal.sceneretrieval.processor.SceneProcessor
import org.openforis.sepal.sceneretrieval.provider.SceneProvider
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.sceneretrieval.publisher.ScenePublisher
import org.openforis.sepal.scenesdownload.DownloadRequest
import org.openforis.sepal.scenesdownload.RequestedScene
import org.openforis.sepal.scenesdownload.ScenesDownloadRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static org.openforis.sepal.scenesdownload.DownloadRequest.SceneStatus.*

class SceneManager implements SceneRetrievalListener {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SceneProvider sceneProvider
    private final SceneProcessor sceneProcessor
    private final ScenePublisher scenePublisher
    private final ScenesDownloadRepository scenesRepository
    private final ScheduledExecutorService executor


    SceneManager(SceneProvider sceneProvider, SceneProcessor sceneProcessor, ScenePublisher scenePublisher, ScenesDownloadRepository scenesRepository) {
        this.sceneProvider = sceneProvider
        this.sceneProcessor = sceneProcessor
        this.scenePublisher = scenePublisher
        this.scenesRepository = scenesRepository
        executor = Executors.newSingleThreadScheduledExecutor()
    }

    void start() {
        executor.scheduleWithFixedDelay(new Job(), 0L, 10L, TimeUnit.SECONDS)
    }

    void stop() {
        executor.shutdown()
        sceneProvider.stop()
    }


    void sceneStatusChanged(
            SceneRequest request,
            DownloadRequest.SceneStatus status
    ) {
        try {
            DownloadRequest downloadRequest = scenesRepository.getById(request.id)
            RequestedScene relatedScene = downloadRequest.scenes.find { it.sceneId = request.sceneReference.id }
            switch (status) {
                case REQUESTED:
                    notifyListeners(request, DOWNLOADING)
                    sceneProvider.retrieve([request])
                    break
                case DOWNLOADED:
                    notifyListeners(request, PROCESSING)
                    sceneProcessor.processScene(request, relatedScene.processingChain)
                    notifyListeners(request, PROCESSED)
                    break
                case PROCESSED:
                    notifyListeners(request, PUBLISHING)
                    scenePublisher.publishScene(request)
                    notifyListeners(request, PUBLISHED)
                    break
            }
        } catch (Exception ex) {
            scenesRepository.sceneStatusChanged(request, FAILED, metadata)
            LOG.error("Error while processing request $request", ex)
        }
    }

    void notifyListeners(SceneRequest request,
                         DownloadRequest.SceneStatus status
    ) {
        scenesRepository.sceneStatusChanged(request, status)
        this.sceneStatusChanged(request, status)
    }

    private class Job implements Runnable {

        @Override
        public void run() {
            List<SceneRequest> requests = scenesRepository.getNewDownloadRequests()
            requests.each {
               sceneStatusChanged(it,REQUESTED)
            }
        }
    }

}
