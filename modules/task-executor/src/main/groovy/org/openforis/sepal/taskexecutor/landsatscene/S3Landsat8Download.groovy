package org.openforis.sepal.taskexecutor.landsatscene

import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.util.download.BackgroundDownloader
import org.openforis.sepal.taskexecutor.util.download.BatchDownloader
import org.openforis.sepal.taskexecutor.util.download.Download
import org.openforis.sepal.taskexecutor.util.download.DownloadRequest

class S3Landsat8Download {
    private final URI endpoint
    private final RESTClient http
    private final BatchDownloader downloader

    S3Landsat8Download(URI endpoint, BackgroundDownloader downloader) {
        this.endpoint = endpoint
        http = new RESTClient(endpoint)
        http.handler.failure = { resp -> return resp }
        this.downloader = new BatchDownloader(downloader)
    }

    List<Download> downloadInBackground(String sceneId, File sceneDir, Closure onCompletion) {
        def downloadRequests = downloadRequests(sceneDir, sceneId)
        if (!downloadRequests)
            []
        def downloads = downloader.downloadBatch(sceneId, downloadRequests) { Download failedDownload ->
            onCompletion.call(failedDownload)
        }
        downloads
    }

    void cancel() {
        downloader.cancel()
    }

    private List<DownloadRequest> downloadRequests(File sceneDir, String sceneId) {
        def response = http.get(path: scenePath(sceneId) + 'index.html')
        if (response.status != 200)
            return []
        response.data.BODY.UL.LI.collect {
            def uri = URI.create("$endpoint${scenePath(sceneId)}${it.A.@href.text()}")
            def out = new FileOutputStream(new File(sceneDir, it.A.text()))
            new DownloadRequest(uri, out)
        }
    }

    @SuppressWarnings("GroovyAssignabilityCheck")
    private String scenePath(String sceneId) {
        def matcher = sceneId =~ /...(...)(...).{12}/
        if (!matcher.find())
            throw new IllegalArgumentException("Malformed Landsat 8 id: $sceneId")
        def path = matcher[0][1]
        def row = matcher[0][2]
        return "L8/$path/$row/$sceneId/"
    }
}
