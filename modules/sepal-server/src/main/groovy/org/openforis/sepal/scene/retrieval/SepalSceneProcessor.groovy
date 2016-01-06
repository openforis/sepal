package org.openforis.sepal.scene.retrieval

import org.openforis.sepal.scene.DownloadRequest
import org.openforis.sepal.scene.SceneProcessor
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.Status
import org.openforis.sepal.scene.retrieval.provider.DownloadRequestObservable
import org.openforis.sepal.scene.retrieval.provider.SceneRetrievalObservable
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.Terminal

import static Status.PROCESSED
import static Status.PROCESSING

class SepalSceneProcessor implements SceneProcessor {
    @Delegate
    @SuppressWarnings("GroovyUnusedDeclaration")
    private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()

    @Delegate
    @SuppressWarnings("GroovyUnusedDeclaration")
    private final DownloadRequestObservable downloadRequestObservable = new DownloadRequestObservable()

    private final SceneRepository sceneRepository
    private final File scriptsHome

    SepalSceneProcessor(SceneRepository sceneRepository, File scriptsHome) {
        this.sceneRepository = sceneRepository
        this.scriptsHome = scriptsHome
        Is.existingFolder(scriptsHome)
    }

    void process(DownloadRequest downloadRequest, String processingChain) {
        notifyRequestStatusChange(downloadRequest, PROCESSING)
        if (processingChain) {
            doProcess(processingChain, sceneRepository.getDownloadRequestWorkingDirectory(downloadRequest))
        }
        notifyRequestStatusChange(downloadRequest, PROCESSED)
    }

    @Override
    void process(SceneRequest request) {
        notifyListeners(request, PROCESSING)
        if (request.processingChain) {
            doProcess(request.processingChain, sceneRepository.getSceneWorkingDirectory(request))
        }
        notifyListeners(request, PROCESSED)
    }

    private void notifyRequestStatusChange(DownloadRequest request, Status status) {
        request.scenes.each { notifyListeners(it, status) }
        notifyDownloadRequestListeners(request, status)
    }

    private void doProcess(String processingChain, File workingDirectory) {
        File scriptFile = new File(scriptsHome, processingChain)
        Is.existingFile(scriptFile)
        def workingDirPath = workingDirectory.absolutePath
        Terminal.execute(workingDirectory, scriptFile.absolutePath, workingDirPath, workingDirPath)
    }

}