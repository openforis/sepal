package org.openforis.sepal.taskexecutor.landsatscene

import org.openforis.sepal.taskexecutor.util.BZip
import org.openforis.sepal.taskexecutor.util.download.BackgroundDownloader
import org.openforis.sepal.taskexecutor.util.download.Download

class GoogleLandsatDownload {
    private final URI endpoint
    private final BackgroundDownloader downloader

    GoogleLandsatDownload(URI endpoint, BackgroundDownloader downloader) {
        this.endpoint = endpoint
        this.downloader = downloader
    }

    Download downloadInBackground(String sceneId, File sceneDir, Closure onCompletion) {
        def uri = URI.create("$endpoint${scenePath(sceneId)}")
        def sceneFile = new File(sceneDir, "${sceneId}.tar.bz")
        def download = downloader.download(uri, new FileOutputStream(sceneFile)) { Download download ->
            if (download.hasFailed())
                return onCompletion.call(download)
            BZip.decompress(sceneFile) // TODO: If this fails, everything blocks and nothing is logged
            // TODO: Catch exception, and pass reason for failure to callback.
            onCompletion.call(null)
        }
        return download
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
