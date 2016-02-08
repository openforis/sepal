package org.openforis.sepal.component.dataprovider.retrieval.provider

import org.openforis.sepal.component.dataprovider.DownloadRequest
import org.openforis.sepal.component.dataprovider.DownloadRequestListener
import org.openforis.sepal.component.dataprovider.Status

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
