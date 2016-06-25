package org.openforis.sepal.taskexecutor.util.download

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class BackgroundDownloader {
    private final ExecutorService executor = Executors.newFixedThreadPool(20)

    /**
     * Requeststhe provided URI and writes it to the provided output stream. When completed, callback is called
     * with Download instance.
     */
    Download download(URI uri, File file, Closure completionCallback) {
        def download = new ExecutableDownload(uri, file)
        executor.submit {
            executeDownload(download, completionCallback)
        }
        return download
    }

    private void executeDownload(ExecutableDownload download, Closure completionCallback) {
        download.execute()
        completionCallback.call(download)
    }

    void stop() {
        executor.shutdownNow()
    }
}

class DownloadRequest {
    final URI uri
    final File file

    DownloadRequest(URI uri, File file) {
        this.uri = uri
        this.file = file
    }
}