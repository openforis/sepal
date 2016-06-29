package org.openforis.sepal.taskexecutor.landsatscene

import groovyx.net.http.RESTClient
import org.openforis.sepal.taskexecutor.util.download.BackgroundDownloader
import org.openforis.sepal.taskexecutor.util.download.BatchDownloader
import org.openforis.sepal.taskexecutor.util.download.Download
import org.openforis.sepal.taskexecutor.util.download.DownloadRequest

import static org.openforis.sepal.taskexecutor.landsatscene.ExecutionResult.failure
import static org.openforis.sepal.taskexecutor.landsatscene.ExecutionResult.success

class S3Landsat8Download {
    private final URI endpoint
    private final RESTClient http
    private final BatchDownloader downloader
    private final String username

    S3Landsat8Download(URI endpoint, BackgroundDownloader downloader, String username) {
        this.endpoint = endpoint
        http = new RESTClient(endpoint)
        http.handler.failure = { resp -> return resp }
        this.downloader = new BatchDownloader(downloader, username)
        this.username = username
    }

    List<Download> downloadInBackground(String sceneId, File sceneDir, Closure onCompletion) {
        def downloadRequests = downloadRequests(sceneDir, sceneId)
        if (!downloadRequests)
            []
        def downloads = downloader.downloadBatch(sceneId, downloadRequests) { Download failedDownload ->
            if (failedDownload)
                onCompletion(failure(failedDownload.message))
            else
                onCompletion(success("Downloaded $sceneId"))
        }
        return downloads
    }

    void cancel() {
        downloader.cancel()
    }

    private List<DownloadRequest> downloadRequests(File sceneDir, String sceneId) {
        def response = http.get(path: scenePath(sceneId) + 'index.html', contentType: 'text/html')
        if (response.status != 200)
            return []
        response.data.BODY.UL.LI.collect {
            def uri = URI.create("$endpoint${scenePath(sceneId)}${it.A.@href.text()}")
            def file = new File(sceneDir, it.A.text() as String)
            new DownloadRequest(uri, file)
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
