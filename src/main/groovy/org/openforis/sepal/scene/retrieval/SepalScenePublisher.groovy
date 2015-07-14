package org.openforis.sepal.scene.retrieval

import org.apache.commons.io.FileUtils
import org.openforis.sepal.scene.ScenePublisher
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.SceneStatus
import org.openforis.sepal.scene.retrieval.provider.SceneRetrievalObservable
import org.openforis.sepal.util.FilePermissions

import static SceneStatus.PUBLISHED
import static SceneStatus.PUBLISHING

class SepalScenePublisher implements ScenePublisher {
    @Delegate
    @SuppressWarnings("GroovyUnusedDeclaration")
    private final SceneRetrievalObservable sceneRetrievalObservable = new SceneRetrievalObservable()
    private final SceneRepository sceneRepository

    SepalScenePublisher(SceneRepository sceneRepository) {
        this.sceneRepository = sceneRepository
    }

    @Override
    void publishScene(SceneRequest request) {
        notifyListeners(request, PUBLISHING)
        File workingDirectory = sceneRepository.getSceneWorkingDirectory(request)
        File targetDirectory = sceneRepository.getSceneHomeDirectory(request)
        FilePermissions.readWritableRecursive(workingDirectory)
        if (targetDirectory.exists()) {
            targetDirectory.deleteDir()
        }
        FileUtils.moveDirectory(workingDirectory, targetDirectory)
        notifyListeners(request, PUBLISHED)
    }

    @Override
    void publishRequest(long requestId, String user, Collection<SceneReference> scenes) {

    }
}