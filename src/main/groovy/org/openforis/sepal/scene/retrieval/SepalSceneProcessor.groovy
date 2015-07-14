package org.openforis.sepal.scene.retrieval

import org.openforis.sepal.scene.*
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.Terminal

import java.util.concurrent.CopyOnWriteArrayList

import static SceneStatus.PROCESSED
import static SceneStatus.PROCESSING

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
                                 SceneStatus status) {
        for (SceneRetrievalListener listener : listeners)
            listener.sceneStatusChanged(request, status)
    }
}