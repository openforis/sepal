package org.openforis.sepal.scene.management

import org.openforis.sepal.scene.SceneStatus
import org.openforis.sepal.scene.SceneRetrievalListener
import org.openforis.sepal.scene.SceneProcessor
import org.openforis.sepal.scene.SceneProvider
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.ScenePublisher
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static SceneStatus.*

class SceneManager implements SceneRetrievalListener {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SceneProvider sceneProvider
    private final SceneProcessor sceneProcessor
    private final ScenePublisher scenePublisher
    private final ScenesDownloadRepository scenesRepository
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor()


    SceneManager(SceneProvider sceneProvider, SceneProcessor sceneProcessor, ScenePublisher scenePublisher, ScenesDownloadRepository scenesRepository) {
        this.sceneProvider = sceneProvider
        this.sceneProcessor = sceneProcessor
        this.scenePublisher = scenePublisher
        this.scenesRepository = scenesRepository
    }

    void start() {
        executor.scheduleWithFixedDelay(new DownloadRequestPoller(), 0L, 10L, TimeUnit.SECONDS)
    }

    void stop() {
        executor.shutdown()
        sceneProvider.stop()
    }

    void sceneStatusChanged(SceneRequest request, SceneStatus status) {
        try {
            switch (status) {
                case REQUESTED:
                    sceneProvider.retrieve([request])
                    break
                case DOWNLOADED:
                    sceneProcessor.processScene(request)
                    break
                case PROCESSED:
                    scenePublisher.publishScene(request)
                    break
            }
        } catch (Exception ex) {
            scenesRepository.sceneStatusChanged(request, FAILED)
            LOG.error("Error while processing request $request", ex)
        }
    }

    private class DownloadRequestPoller implements Runnable {
        @Override
        public void run() {
            def requests = scenesRepository.getNewDownloadRequests()
            requests.each {
                sceneStatusChanged(it, REQUESTED)
            }
        }
    }

}
