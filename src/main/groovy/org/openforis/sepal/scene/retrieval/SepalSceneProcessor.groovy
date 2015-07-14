package org.openforis.sepal.scene.retrieval

import org.openforis.sepal.scene.SceneProcessor
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.SceneStatus
import org.openforis.sepal.scene.retrieval.provider.SceneRetrievalObservable
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.Terminal

import static SceneStatus.PROCESSED
import static SceneStatus.PROCESSING

class SepalSceneProcessor implements SceneProcessor {
    @Delegate
    @SuppressWarnings("GroovyUnusedDeclaration")
    private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()
    private final SceneRepository sceneRepository
    private final File scriptsHome

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
}