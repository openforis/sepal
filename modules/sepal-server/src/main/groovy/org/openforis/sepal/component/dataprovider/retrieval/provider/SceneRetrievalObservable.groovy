package org.openforis.sepal.component.dataprovider.retrieval.provider

import org.openforis.sepal.component.dataprovider.SceneRequest
import org.openforis.sepal.component.dataprovider.SceneRetrievalListener
import org.openforis.sepal.component.dataprovider.Status

import java.util.concurrent.CopyOnWriteArrayList

class SceneRetrievalObservable {
    private final List<SceneRetrievalListener> listeners = new CopyOnWriteArrayList<>()

    final void register(SceneRetrievalListener... listeners) {
        listeners.each {
            this.listeners.add(it)
        }
    }

    final void notifyListeners(SceneRequest request, Status status) {
        listeners.each {
            it.sceneStatusChanged(request, status)
        }
    }

}
