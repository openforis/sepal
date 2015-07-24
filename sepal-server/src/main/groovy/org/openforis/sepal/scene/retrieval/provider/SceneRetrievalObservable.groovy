package org.openforis.sepal.scene.retrieval.provider

import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.SceneRetrievalListener
import org.openforis.sepal.scene.SceneStatus

import java.util.concurrent.CopyOnWriteArrayList

class SceneRetrievalObservable {
    private final List<SceneRetrievalListener> listeners = new CopyOnWriteArrayList<>()

    final void register(SceneRetrievalListener... listeners) {
        listeners.each {
            this.listeners.add(it)
        }
    }

    final void notifyListeners(SceneRequest request, SceneStatus status) {
        listeners.each {
            it.sceneStatusChanged(request, status)
        }
    }

}
