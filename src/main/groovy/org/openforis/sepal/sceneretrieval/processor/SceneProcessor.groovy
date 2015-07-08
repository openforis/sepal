package org.openforis.sepal.sceneretrieval.processor

import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRepository
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.Terminal
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface SceneProcessor {

    void processScene(SceneRequest sceneRequest, String processingScript)

    void processRequest(long requestId, Collection<SceneReference> scenes, String processingScript)
}

class SepalSceneProcessor implements SceneProcessor {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SceneRepository sceneRepository
    private final File scriptsHome

    SepalSceneProcessor(SceneRepository sceneRepository, File scriptsHome) {
        this.sceneRepository = sceneRepository
        this.scriptsHome = scriptsHome
        Is.existingFolder(scriptsHome)
    }

    @Override
    void processScene(SceneRequest sceneRequest, String processingScript) {
        if (processingScript){
            File scriptFile = new File(scriptsHome, processingScript)
            Is.existingFile(scriptFile)
            def sceneWorkingDir = sceneRepository.getSceneWorkingDirectory(sceneRequest)
            def sceneWorkingDirPath = sceneWorkingDir.absolutePath

            Terminal.execute(sceneWorkingDir, scriptFile.absolutePath, sceneWorkingDirPath, sceneWorkingDirPath)
        }

    }

    @Override
    void processRequest(long requestId, Collection<SceneReference> scenes, String processingScript) {

    }
}