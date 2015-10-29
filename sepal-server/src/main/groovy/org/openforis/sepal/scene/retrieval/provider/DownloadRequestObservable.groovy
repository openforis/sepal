package org.openforis.sepal.scene.retrieval.provider

import org.openforis.sepal.scene.DownloadRequest
import org.openforis.sepal.scene.DownloadRequestListener
import org.openforis.sepal.scene.Status

import java.util.concurrent.CopyOnWriteArrayList

class DownloadRequestObservable {

    private final List<DownloadRequestListener> listeners = new CopyOnWriteArrayList<>()

    final void registerDownloadRequestListener(DownloadRequestListener... listeners) {
        listeners.each {
            this.listeners.add(it)
        }
    }

    final void notifyDownloadRequestListeners(DownloadRequest request, Status status) {
        listeners.each {
            it.requestStatusChanged(request, status)
        }
    }
}
