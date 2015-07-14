package org.openforis.sepal.sceneretrieval.processor

import org.openforis.sepal.sceneretrieval.SceneRetrievalListener
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRepository
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.scenesdownload.DownloadRequest
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.Terminal

import java.util.concurrent.CopyOnWriteArrayList

import static org.openforis.sepal.scenesdownload.DownloadRequest.SceneStatus.PROCESSED
import static org.openforis.sepal.scenesdownload.DownloadRequest.SceneStatus.PROCESSING

interface SceneProcessor {

    void processScene(SceneRequest sceneRequest)

    void processRequest(long requestId, Collection<SceneReference> scenes, String processingScript)

    void register(SceneRetrievalListener... listeners)
}

class SepalSceneProcessor implements SceneProcessor {
    private final SceneRepository sceneRepository
    private final File scriptsHome
    private final List<SceneRetrievalListener> listeners = new CopyOnWriteArrayList<>()

    SepalSceneProcessor(SceneRepository sceneRepository, File scriptsHome) {
        this.sceneRepository = sceneRepository
        this.scriptsHome = scriptsHome
        Is.existingFolder(scriptsHome)
    }

    @Override
    void processScene(SceneRequest request) {
        notifyListeners(request, PROCESSING)
        def processingChain = request.processingChain
        if (processingChain) {
            File scriptFile = new File(scriptsHome, processingChain)
            Is.existingFile(scriptFile)
            def sceneWorkingDir = sceneRepository.getSceneWorkingDirectory(request)
            def sceneWorkingDirPath = sceneWorkingDir.absolutePath

            Terminal.execute(sceneWorkingDir, scriptFile.absolutePath, sceneWorkingDirPath, sceneWorkingDirPath)
        }
        notifyListeners(request, PROCESSED)
    }

    @Override
    void processRequest(long requestId, Collection<SceneReference> scenes, String processingScript) {

    }

    void register(SceneRetrievalListener... listeners) {
        listeners.each {
            this.listeners.add(it)
        }
    }

    private void notifyListeners(SceneRequest request,
                                 DownloadRequest.SceneStatus status) {
        for (SceneRetrievalListener listener : listeners)
            listener.sceneStatusChanged(request, status)
    }
}