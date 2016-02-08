package org.openforis.sepal.component.dataprovider

interface DownloadRequestListener {

    void requestStatusChanged(DownloadRequest request, Status status)
}
