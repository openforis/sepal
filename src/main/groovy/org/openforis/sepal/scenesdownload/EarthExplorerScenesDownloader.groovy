package org.openforis.sepal.scenesdownload

import org.apache.commons.io.FileUtils
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.dataprovider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.model.User
import org.openforis.sepal.repository.DataSetRepository
import org.openforis.sepal.repository.UserRepository
import org.openforis.sepal.scenesdownload.DownloadRequest.RequestStatus
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import util.FilePermissions

import java.util.concurrent.Callable

class EarthExplorerScenesDownloader implements Callable<RequestStatus> {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private DownloadRequest downloadRequest
    private ScenesDownloadRepository repository
    private DataSetRepository dataSetRepository
    private UserRepository userRepo
    private RestfulEarthExplorerClient earthExplorerClient
    private File downloadWorkingDirectory
    private User user
    private File userHomeDir

    EarthExplorerScenesDownloader(DownloadRequest downloadRequest, ScenesDownloadRepository repository, RestfulEarthExplorerClient earthExplorerClient, DataSetRepository dataSetRepository, UserRepository userRepo) {
        this.downloadRequest = downloadRequest
        this.repository = repository
        this.earthExplorerClient = earthExplorerClient
        this.dataSetRepository = dataSetRepository
        this.userRepo = userRepo
        init()
    }

    private void init() {
        SepalConfiguration config = SepalConfiguration.instance
        this.downloadWorkingDirectory = new File(config.downloadWorkingDirectory, "" + downloadRequest.requestId)
        downloadWorkingDirectory.mkdirs()
        user = userRepo.getUserById(downloadRequest.requestor)
        userHomeDir = new File(config.getUserHomeDir(user.username))
        if (!userHomeDir.exists()) {
            userHomeDir.mkdirs()
        }
    }

    public RequestStatus call() throws Exception {
        LOG.debug("New download triggered. Request id $downloadRequest.requestId")
        repository.updateDownloadStatus(downloadRequest.requestId, RequestStatus.STARTED)
        try {
            earthExplorerClient.login()
            String[] directLinks = collectDownloadLinks()
            repository.updateDownloadStatus(downloadRequest.requestId, RequestStatus.DOWNLOADING)
            File[] files = directLinks.collect { earthExplorerClient.download(it, downloadWorkingDirectory) }
            repository.updateDownloadStatus(downloadRequest.requestId, RequestStatus.UNZIPPING)
            File[] scenes = unzipScenes(files)
            repository.updateDownloadStatus(downloadRequest.requestId, RequestStatus.PROCESSING)
            processScenes(scenes)
            repository.updateDownloadStatus(downloadRequest.requestId, RequestStatus.COMPLETED, "Download Completed", true)

            downloadWorkingDirectory.deleteDir()
        } catch (Exception ex) {
            LOG.error("Error while working on RequestId $downloadRequest.requestId", ex)
            repository.updateDownloadStatus(downloadRequest.requestId, RequestStatus.FAILED, ex.getMessage(), true)
        } finally {
            earthExplorerClient.logout()
        }
        return null
    }

    private String[] collectDownloadLinks() {
        def dataSet = dataSetRepository.getDataSetById(downloadRequest.dataSetId)
        LOG.debug("Working with dataSet $dataSet")
        earthExplorerClient.getScenesDirectLinks(downloadRequest, dataSet)
    }

    private void processScenes(File[] scenes) {
        scenes.each { scene ->
            File targetDir = new File(userHomeDir, scene.name)
            targetDir.deleteDir()
            if (downloadRequest.processingChain) {
                def chainFullPath = SepalConfiguration.instance.getProcessingHomeDir() + downloadRequest.processingChain
                def builder = new ProcessBuilder(chainFullPath)
                        .directory(scene)
                        .redirectErrorStream(true)
                        .redirectOutput(ProcessBuilder.Redirect.INHERIT)
                LOG.debug("Going to execute command $chainFullPath")
                Process process = builder.start()
                try {
                    def result = process.waitFor()
                    if (result != 0) {
                        throw new IllegalStateException("Failed to execute - " + result)
                    }
                    LOG.debug("Command executed. Exit value $result")
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt()
                    throw new IllegalStateException(e)
                }
            }

            FilePermissions.readWritableRecursive(scene)
            if (targetDir.exists())
                targetDir.deleteDir()
            FileUtils.moveDirectory(scene, targetDir)
        }
    }


}
