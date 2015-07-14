package org.openforis.sepal.sceneretrieval.publisher

import org.apache.commons.io.FileUtils
import org.openforis.sepal.SceneStatus
import org.openforis.sepal.sceneretrieval.SceneRetrievalListener
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRepository
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.util.FilePermissions

import java.util.concurrent.CopyOnWriteArrayList

import static org.openforis.sepal.SceneStatus.PUBLISHED
import static org.openforis.sepal.SceneStatus.PUBLISHING

interface ScenePublisher {

    void publishScene(SceneRequest sceneRequest)

    void publishRequest(long requestId, String user, Collection<SceneReference> scenes)

    void register(SceneRetrievalListener... listeners)
}

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