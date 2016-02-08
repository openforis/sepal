package org.openforis.sepal.component.datasearch.metadata

import org.openforis.sepal.component.dataprovider.management.DataSetRepository
import org.openforis.sepal.component.datasearch.metadata.crawling.MetadataCrawler
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

interface MetadataProviderManager {
    MetadataProviderManager registerCrawler(crawler)

    void start()

    void stop()
}

class ConcreteMetadataProviderManager implements MetadataProviderManager {
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor()
    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final DataSetRepository dataSetRepository
    private final Map<Integer, MetadataCrawler> crawlers = [:]
    private final long crawlerRunDelay

    ConcreteMetadataProviderManager(DataSetRepository dataSetRepository, long crawlerRunDelay) {
        this.crawlerRunDelay = crawlerRunDelay
        this.dataSetRepository = dataSetRepository
    }

    @Override
    MetadataProviderManager registerCrawler(crawler) {
        LOG.info("registing crawler $crawler ($crawler.providerId)")
        crawlers.put(crawler.providerId, crawler)
        return this
    }

    @Override
    void start() {
        executor.scheduleWithFixedDelay(new FetchMetadataWorker(), 0L, crawlerRunDelay, TimeUnit.HOURS)
    }

    void stop() {
        executor.shutdownNow()
    }


    private class FetchMetadataWorker implements Runnable {

        @Override
        void run() {
            LOG.info("New crawling started")
            try {
                doCrawl()
            } catch (Exception ex) {
                LOG.error("Error during crawling", ex)
            }

        }

        void doCrawl() {
            dataSetRepository.getMetadataProviders().each { MetadataProvider it ->
                LOG.debug("Searching crawling implementation for $it.name")
                def crawler = crawlers.get(it.id)
                if (crawler) {
                    try {
                        LOG.debug("Invoking crawl($it) on $crawler")
                        dataSetRepository.updateCrawlingStartTime(it.id, new Date())
                        crawler.crawl(it)
                    } catch (Exception ex) {
                        LOG.error("Error during crawling with $crawler", ex)
                    } finally {
                        dataSetRepository.updateCrawlingEndTime(it.id, new Date())
                    }
                } else {
                    LOG.warn("No crawler found for $it")
                }
            }
        }
    }

}