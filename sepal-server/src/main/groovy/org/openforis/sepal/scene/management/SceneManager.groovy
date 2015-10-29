package org.openforis.sepal.scene.management

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.scene.*
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static org.openforis.sepal.scene.Status.*

class SceneManager implements SceneRetrievalListener,DownloadRequestListener {
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
        executor.scheduleWithFixedDelay(new DownloadRequestPoller(), 0L, SepalConfiguration.instance.downloadCheckInterval, TimeUnit.SECONDS)
    }

    void stop() {
        executor.shutdown()
        sceneProvider.stop()
    }

    @Override
    void requestStatusChanged(DownloadRequest request, Status status) {
        try{
            if (request.groupScenes){
                switch (status) {
                    case REQUESTED:
                        sceneProvider.retrieve(request.scenes)
                        break
                    case DOWNLOADED:
                        sceneProcessor.process(request,request.processingChain)
                        break
                    case PROCESSED:
                        scenePublisher.publish(request)
                        break
                    case FAILED:
                        throw new RuntimeException("FAILED signal dispatched. Something went wrong")
                        break;
                }
            }else{
                /* We are not handling overall request status.
                 Each scene is a separate piece of data */
                scenesRepository.requestStatusChanged(request,UNKNOWN)
                request.scenes.each {
                    sceneStatusChanged(it,status)
                }
            }
        }catch (Exception ex){
            scenesRepository.requestStatusChanged(request,FAILED)
            LOG.error("Error while processing request $request",ex)
        }
    }

    @Override
    void sceneStatusChanged(SceneRequest scene, Status status) {
        try {
            if (scene.request.groupScenes){
                def request = scene.request
                LOG.debug("$status signal for $request. Working on an atomic download request")
                switch (status) {
                    case DOWNLOADED:
                        if (scenesRepository.hasStatus(request.requestId,status)){
                            scenesRepository.requestStatusChanged(request,status)
                            requestStatusChanged(request,status)
                        }
                        break;
                }
            }else{
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
                }
            }
        } catch (Exception ex) {
            scenesRepository.sceneStatusChanged(scene, FAILED)
            LOG.error("Error while processing scene $scene", ex)
            requestStatusChanged(scene?.request,FAILED)
        }
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
