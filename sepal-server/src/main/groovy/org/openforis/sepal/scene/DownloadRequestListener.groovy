package org.openforis.sepal.scene

/**
 * Created by ottavio on 27/10/15.
 */
interface DownloadRequestListener {

    void requestStatusChanged(DownloadRequest request, Status status)
}
