package org.openforis.sepal.taskexecutor.landsatscene

import org.openforis.sepal.taskexecutor.util.BZip
import org.openforis.sepal.taskexecutor.util.FileOwner
import org.openforis.sepal.taskexecutor.util.download.BackgroundDownloader
import org.openforis.sepal.taskexecutor.util.download.Download

import static org.openforis.sepal.taskexecutor.landsatscene.ExecutionResult.failure
import static org.openforis.sepal.taskexecutor.landsatscene.ExecutionResult.success

class GoogleLandsatDownload {
    private final URI endpoint
    private final BackgroundDownloader downloader
    private final String username

    GoogleLandsatDownload(URI endpoint, BackgroundDownloader downloader, String username) {
        this.endpoint = endpoint
        this.downloader = downloader
        this.username = username
    }

    Download downloadInBackground(String sceneId, File sceneDir, Closure onCompletion) {
        def uri = URI.create("$endpoint${scenePath(sceneId)}")
        def sceneFile = new File(sceneDir, "${sceneId}.tar.bz")
        FileOwner.set(sceneFile, this.username)
        def download = downloader.download(uri, sceneFile) { Download download ->
            onDownloadCompleted(sceneId, download, sceneFile, onCompletion)
        }
        return download
    }

    private void onDownloadCompleted(String sceneId, Download download, File sceneFile, Closure onCompletion) {
        try {
            if (download.hasFailed()) {
                onCompletion(failure(download.message))
                return
            }
            BZip.decompress(sceneFile, username)
            onCompletion(success("Downloaded $sceneId"))
        } catch (Exception e) {
            onCompletion(failure(e.message))
        }
    }

    @SuppressWarnings("GroovyAssignabilityCheck")
    private String scenePath(String sceneId) {
        def matcher = sceneId =~ /(...)(...)(...).{12}/
        if (!matcher.find())
            throw new IllegalArgumentException("Malformed Landsat scene id: $sceneId")
        def sensor = matcher[0][1]
        def path = matcher[0][2]
        def row = matcher[0][3]
        def gsDir = SENSOR_TO_GS_DIR[sensor]
        if (!gsDir)
            throw new IllegalArgumentException("Unexpected sensor in landsat scene id: $sceneId")
        return "earthengine-public/landsat/$gsDir/$path/$row/${sceneId}.tar.bz"
    }

    private static final Map<String, String> SENSOR_TO_GS_DIR = [
            LT5: 'L5',
            LE7: 'L7',
            LC8: 'L8',
            LM1: 'LM1',
            LM2: 'LM2',
            LM3: 'LM3',
            LM4: 'LM4',
            LM5: 'LM5',
            LT4: 'LT4'
    ]
}
