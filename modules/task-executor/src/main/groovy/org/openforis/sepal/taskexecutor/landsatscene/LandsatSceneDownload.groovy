package org.openforis.sepal.taskexecutor.landsatscene

import org.openforis.sepal.taskexecutor.api.*
import org.openforis.sepal.taskexecutor.util.download.Download

import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.BlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class LandsatSceneDownload implements TaskExecutor {
    private final Task task
    private final File workingDir
    private final S3Landsat8Download s3Landsat8Download
    private final GoogleLandsatDownload googleLandsatDownload
    private final BlockingQueue sceneCompletionQueue
    private final AtomicInteger completedSceneCount = new AtomicInteger()
    private final List<String> sceneIds
    private final Map<String, List<Download>> downloadsBySceneId = new ConcurrentHashMap<>()

    LandsatSceneDownload(
            Task task,
            File workingDir,
            S3Landsat8Download s3Landsat8Download,
            GoogleLandsatDownload googleLandsatDownload) {
        this.task = task
        this.workingDir = workingDir
        this.s3Landsat8Download = s3Landsat8Download
        this.googleLandsatDownload = googleLandsatDownload
        sceneIds = task.params.sceneIds
        sceneCompletionQueue = new ArrayBlockingQueue(sceneIds.size())
    }

    void execute() {
        sceneIds.each { sceneId ->
            downloadSceneInBackground(sceneId)
        }
        waitUntilScenesAreDownloaded()
    }

    Progress progress() {
        def completedSceneCount = completedSceneCount.get()
        def sceneCount = sceneIds.size()
        if (completedSceneCount == sceneCount)
            return new Progress("Downloaded $sceneCount scene${sceneCount > 1 ? 's' : ''}")
        def downloadMessage = "Downloaded ${completedSceneCount} of ${sceneCount} scenes"
        def downloads = downloadsBySceneId.values().flatten()
        def allDownloadsCompleted = downloads.every() { it.hasCompleted() }
        if (allDownloadsCompleted)
            return new Progress(downloadMessage + " (Preparing scenes)")
        def bytesDownloaded = downloads.sum { it.downloadedBytes } ?: 0
        def gbDownloaded = bytesDownloaded / 1024d / 1024d / 1024d // KB / MB / GB
        return new Progress(downloadMessage + " (${gbDownloaded.round(3)} GB transfered)")
    }

    private waitUntilScenesAreDownloaded() {
        def sceneCount = sceneIds.size()
        sceneCount.times {
            def failedDownload = sceneCompletionQueue.take() // Wait until scene is completed
            completedSceneCount.incrementAndGet()
            if (failedDownload instanceof Download)
                throw new TaskFailed(task, failedDownload.message)
        }
    }

    private void downloadSceneInBackground(String sceneId) {
        def sceneDir = new File(workingDir, sceneId)
        sceneDir.mkdir()
        def onCompletion = { Download failedDownload ->
            sceneCompletionQueue.add(failedDownload ?: false)
        }

        def downloads = null
        if (sceneId.startsWith('LC8'))
            downloads = s3Landsat8Download.downloadInBackground(sceneId, sceneDir, onCompletion)
        if (!downloads)
            downloads = [googleLandsatDownload.downloadInBackground(sceneId, sceneDir, onCompletion)]
        downloadsBySceneId[sceneId] = downloads
    }

    void cancel() {
        s3Landsat8Download.cancel()
        googleLandsatDownload.cancel()
    }

    static class Factory implements TaskExecutorFactory {
        private final File workingDir
        private final S3Landsat8Download s3Landsat8Download
        private final GoogleLandsatDownload gsLandsatDownload

        Factory(File workingDir, S3Landsat8Download s3Landsat8Download, GoogleLandsatDownload gsLandsatDownload) {
            this.workingDir = workingDir
            this.s3Landsat8Download = s3Landsat8Download
            this.gsLandsatDownload = gsLandsatDownload
        }

        TaskExecutor create(Task task) {
            return new LandsatSceneDownload(task, workingDir, s3Landsat8Download, gsLandsatDownload)
        }
    }
}
