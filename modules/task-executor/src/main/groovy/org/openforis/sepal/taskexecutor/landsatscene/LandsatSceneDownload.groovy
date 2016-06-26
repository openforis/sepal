package org.openforis.sepal.taskexecutor.landsatscene

import org.openforis.sepal.taskexecutor.api.*
import org.openforis.sepal.taskexecutor.util.FileOwner
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
    private final BlockingQueue<ExecutionResult> sceneResults
    private final AtomicInteger completedSceneCount = new AtomicInteger()
    private final List<String> sceneIds
    private final Map<String, List<Download>> downloadsBySceneId = new ConcurrentHashMap<>()
    private final String username

    LandsatSceneDownload(
            Task task,
            File workingDir,
            S3Landsat8Download s3Landsat8Download,
            GoogleLandsatDownload googleLandsatDownload,
            String username) {
        this.task = task
        this.workingDir = workingDir
        this.s3Landsat8Download = s3Landsat8Download
        this.googleLandsatDownload = googleLandsatDownload
        this.username = username
        sceneIds = task.params.sceneIds
        sceneResults = new ArrayBlockingQueue(sceneIds.size())
    }

    String getTaskId() {
        return task.id
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
            return new Progress(downloadMessage + " (Unpacking scenes)")
        def bytesDownloaded = downloads.sum { it.downloadedBytes } ?: 0
        def gbDownloaded = bytesDownloaded / 1024d / 1024d / 1024d // KB / MB / GB
        return new Progress(downloadMessage + " (${gbDownloaded.round(3)} GB transfered)")
    }

    private waitUntilScenesAreDownloaded() {
        def sceneCount = sceneIds.size()
        sceneCount.times {
            def executionResult = sceneResults.take() // Wait until scene is completed
            completedSceneCount.incrementAndGet()
            if (executionResult.failure)
                throw new TaskFailed(task, executionResult.message)
        }
    }

    private void downloadSceneInBackground(String sceneId) {
        def sceneDir = new File(workingDir, sceneId)
        sceneDir.mkdir()
        FileOwner.set(sceneDir, username)
        def onCompletion = { ExecutionResult result ->
            sceneResults.add(result)
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
    }

    static class Factory implements TaskExecutorFactory {
        private final File workingDir
        private final S3Landsat8Download s3Landsat8Download
        private final GoogleLandsatDownload gsLandsatDownload
        private final String username

        Factory(
                File workingDir,
                S3Landsat8Download s3Landsat8Download,
                GoogleLandsatDownload gsLandsatDownload,
                String username) {
            this.workingDir = workingDir
            this.s3Landsat8Download = s3Landsat8Download
            this.gsLandsatDownload = gsLandsatDownload
            this.username = username
        }

        TaskExecutor create(Task task) {
            return new LandsatSceneDownload(task, workingDir, s3Landsat8Download, gsLandsatDownload, username)
        }
    }
}
