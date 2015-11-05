package org.openforis.sepal.scene

interface DownloadRequestListener {

    void requestStatusChanged(DownloadRequest request, Status status)
}
