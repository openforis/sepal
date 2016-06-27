package org.openforis.sepal.taskexecutor.util.download

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class BatchDownloader {
    private final BackgroundDownloader backgroundDownloader
    private final completedBatches = new LinkedBlockingQueue<BatchRequest>()
    private final Map<Download, Boolean> downloads = new ConcurrentHashMap<>()
    private final String username
    private final canceled = new AtomicBoolean()

    BatchDownloader(BackgroundDownloader backgroundDownloader, String username) {
        this.backgroundDownloader = backgroundDownloader
        this.username = username
    }

    List<Download> downloadBatch(String batchId, Collection<DownloadRequest> downloadRequests, Closure onCompletion) {
        def batchRequest = new BatchRequest(batchId, downloadRequests.size())
        batchRequest.onCompletion { Download failedDownload ->
            if (failedDownload)
                batchRequest.failed(failedDownload)
            completedBatches.add(batchRequest)
            onCompletion.call(batchRequest.failedDownload)
        }
        downloadRequests.collect {
            if (canceled.get())
                throw new DownloadCanceled()
            def download = backgroundDownloader.download(it.uri, it.file, username) { Download download ->
                batchRequest.downloadCompleted(download)
            }
            downloads[download] = true
            return download
        }
    }

    void cancel() {
        downloads.keySet().each {
            it.cancel()
        }
        canceled.set(true)
    }

    private static class BatchRequest {
        private final String batchId
        private final int totalCount
        private Closure completionCallback
        private final completedCount = new AtomicInteger()
        private final failedDownload = new AtomicReference<Download>()

        BatchRequest(String batchId, int totalCount) {
            this.batchId = batchId
            this.totalCount = totalCount
        }

        void downloadCompleted(Download download) {
            if (download.hasFailed() || download.canceled) {
                completionCallback.call(download)
                return
            }
            if (completedCount.incrementAndGet() == totalCount)
                completionCallback.call(null)
        }

        /**
         * Callback for when batch completed. Passes the failed download to the callback if batch fails, otherwise null.
         */
        void onCompletion(Closure completionCallback) {
            this.completionCallback = completionCallback
        }

        void failed(Download download) {
            failedDownload.set(download)
        }

        Download getFailedDownload() {
            failedDownload.get()
        }
    }
}

class DownloadCanceled extends RuntimeException {

}
