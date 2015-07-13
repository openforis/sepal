package org.openforis.sepal.sceneretrieval.publisher

import org.apache.commons.io.FileUtils
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRepository
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import util.FilePermissions

interface ScenePublisher {

    void publishScene(SceneRequest sceneRequest)

    void publishRequest(long requestId, String user, Collection<SceneReference> scenes)

}

class SepalScenePublisher implements ScenePublisher {

    private final SceneRepository sceneRepository

    SepalScenePublisher(SceneRepository sceneRepository) {
        this.sceneRepository = sceneRepository
    }

    @Override
    void publishScene(SceneRequest sceneRequest) {
        File workingDirectory = sceneRepository.getSceneWorkingDirectory(sceneRequest)
        File targetDirectory = sceneRepository.getSceneHomeDirectory(sceneRequest)
        FilePermissions.readWritableRecursive(workingDirectory)
        if (targetDirectory.exists()) {
            targetDirectory.deleteDir()
        }
        FileUtils.moveDirectory(workingDirectory, targetDirectory)
    }

    @Override
    void publishRequest(long requestId, String user, Collection<SceneReference> scenes) {

    }
}