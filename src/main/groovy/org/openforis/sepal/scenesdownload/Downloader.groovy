package org.openforis.sepal.scenesdownload

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.sceneretrieval.provider.earthexplorer.RestfulEarthExplorerClient
import org.openforis.sepal.repository.DataSetRepository
import org.openforis.sepal.repository.UserRepository
import org.openforis.sepal.transaction.SqlConnectionManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class Downloader {

    private static final Logger LOG = LoggerFactory.getLogger(Downloader.class)
    private ExecutorService executorService
    private ScenesDownloadRepository repository
    private DataSetRepository dataSetRepository
    private UserRepository userRepository
    private RestfulEarthExplorerClient client
    private final Thread thread = new Thread(new Runnable() {
        void run() {
            new Downloader().startDownloading()
        }
    })

    Downloader() {
        def connectionManager = new SqlConnectionManager(SepalConfiguration.instance.dataSource)
        repository = new JdbcScenesDownloadRepository(connectionManager)
        dataSetRepository = new DataSetRepository(connectionManager)
        client = new RestfulEarthExplorerClient()
        userRepository = new UserRepository(connectionManager)
    }

    void start() {
        LOG.info("Starting downloader process")
        thread.start()
    }

    void stop() {
        thread.interrupt()
    }

    void startDownloading() {
        try {
            SepalConfiguration sepConf = SepalConfiguration.instance
            def threadNum = sepConf.getMaxConcurrentDownloads()
            executorService = Executors.newFixedThreadPool(threadNum)
            while (!Thread.currentThread().isInterrupted()) {
                checkRequests()
                Thread.sleep(sepConf.getDownloadCheckInterval())
            }
        } catch (InterruptedException ignore) {
            Thread.currentThread().interrupt()
        }
    }

    void checkRequests() {
        LOG.trace("Going to check any new download requests")
        List<DownloadRequest> downloadRequests = repository.getNewDownloadRequests()
        if (downloadRequests) {
            LOG.debug("Processing $downloadRequests.size requests")
            downloadRequests.each {
                executorService.submit(new EarthExplorerScenesDownloader(it, repository, client, dataSetRepository, userRepository))
            }
        }
    }

}
