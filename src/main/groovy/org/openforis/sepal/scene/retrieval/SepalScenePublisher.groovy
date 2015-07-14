package org.openforis.sepal.scene.retrieval

import org.apache.commons.io.FileUtils
import org.openforis.sepal.scene.ScenePublisher
import org.openforis.sepal.scene.SceneStatus
import org.openforis.sepal.scene.SceneRetrievalListener
import org.openforis.sepal.scene.SceneReference
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.util.FilePermissions

import java.util.concurrent.CopyOnWriteArrayList

import static SceneStatus.PUBLISHED
import static SceneStatus.PUBLISHING


class SepalScenePublisher implements ScenePublisher {
    private final SceneRepository sceneRepository
    private final List<SceneRetrievalListener> listeners = new CopyOnWriteArrayList<>()

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

    void register(SceneRetrievalListener... listeners) {
        listeners.each {
            this.listeners.add(it)
        }
    }

    private void notifyListeners(SceneRequest request, SceneStatus status) {
        for (SceneRetrievalListener listener : listeners)
            listener.sceneStatusChanged(request, status)
    }
}