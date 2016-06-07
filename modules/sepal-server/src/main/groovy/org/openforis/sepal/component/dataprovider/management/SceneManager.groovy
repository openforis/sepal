package org.openforis.sepal.component.dataprovider.management

import org.openforis.sepal.component.dataprovider.*
import org.openforis.sepal.util.NamedThreadFactory
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static org.openforis.sepal.component.dataprovider.Status.*

// @ TODO Implement more test cases
class SceneManager implements SceneRetrievalListener, DownloadRequestListener {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SceneProvider sceneProvider
    private final SceneProcessor sceneProcessor
    private final ScenePublisher scenePublisher
    private final ScenesDownloadRepository scenesRepository
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(
            NamedThreadFactory.singleThreadFactory('sceneDownloadRequestPoller')
    )

    int downloadCheckInterval = 5

    SceneManager(SceneProvider sceneProvider,
                 SceneProcessor sceneProcessor,
                 ScenePublisher scenePublisher,
                 ScenesDownloadRepository scenesRepository) {
        this.sceneProvider = sceneProvider
        this.sceneProcessor = sceneProcessor
        this.scenePublisher = scenePublisher
        this.scenesRepository = scenesRepository
    }

    void start() {
        executor.scheduleWithFixedDelay(new DownloadRequestPoller(), 0L, downloadCheckInterval, TimeUnit.SECONDS)
    }

    void stop() {
        executor.shutdown()
        sceneProvider.stop()
    }

    @Override
    void requestStatusChanged(DownloadRequest request, Status status) {
        LOG.debug("Request status change. request: $request, status: $status")
        try {
            if (request.groupScenes) {
                switch (status) {
                    case REQUESTED:
                        scenesRepository.requestStatusChanged(request, DOWNLOADING)
                        sceneProvider.retrieve(request.scenes)
                        break
                    case DOWNLOADED:
                        scenesRepository.reloadRequestData(request)
                        if (request.status == FAILED) {
                            throw new RuntimeException("Downloaded signal received from a scene within an already failed request")
                        } else {
                            sceneProcessor.process(request, request.processingChain)
                        }
                        break
                    case PROCESSED:
                        scenePublisher.publish(request)
                        break
                    case FAILED:
                        throw new RuntimeException("FAILED signal dispatched. Something went wrong")
                        break;
                }
            } else {
                /* We are not handling overall request status.
                 Each scene is a separate piece of data */
                scenesRepository.requestStatusChanged(request, UNKNOWN)
                request.scenes.each {
                    sceneStatusChanged(it, status)
                }
            }
        } catch (Exception ex) {
            LOG.error("Error while processing request $request", ex)
            scenesRepository.requestStatusChanged(request, FAILED)
            request?.scenes?.each {
                sceneStatusChanged(it, FAILED, false)
            }
        }
    }

    void sceneStatusChanged(SceneRequest scene, Status status, Boolean propagateError) {
        try {
            if (scene.request.groupScenes) {
                def request = scene.request
                LOG.debug("$status signal for $request. Working on an atomic download request")
                switch (status) {
                    case DOWNLOADED:
                        if (scenesRepository.hasStatus(request.requestId, status)) {
                            scenesRepository.requestStatusChanged(request, status)
                            requestStatusChanged(request, status)
                        }
                        break;
                    case FAILED:
                        if (propagateError) {
                            requestStatusChanged(request, FAILED)
                        } else {
                            scenesRepository.sceneStatusChanged(scene, FAILED)
                        }
                }
            } else {
                switch (status) {
                    case REQUESTED:
                        sceneProvider.retrieve([scene])
                        break
                    case DOWNLOADED:
                        sceneProcessor.process(scene)
                        break
                    case PROCESSED:
                        scenePublisher.publish(scene)
                        break
                    case FAILED:
                        throw new RuntimeException("Failed signal dispatched for scene $scene.id. Something went wrong")
                }
            }
        } catch (Exception ex) {
            LOG.error("Error while processing scene $scene", ex)
            scenesRepository.sceneStatusChanged(scene, FAILED)
            if (propagateError && scene?.request?.groupScenes) {
                requestStatusChanged(scene?.request, FAILED)
            }
        }
    }

    @Override
    void sceneStatusChanged(SceneRequest scene, Status status) {
        sceneStatusChanged(scene, status, true)
    }

    private class DownloadRequestPoller implements Runnable {
        @Override
        public void run() {
            def requests = scenesRepository.getNewDownloadRequests()
            requests.each { request ->
                requestStatusChanged(request, REQUESTED)
            }
        }
    }

}
