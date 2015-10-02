package org.openforis.sepal.metadata

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.metadata.crawling.MetadataCrawler
import org.openforis.sepal.scene.management.DataSetRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

interface MetadataProviderManager {


    MetadataProviderManager registerCrawler(crawler)
    def start()


}

class ConcreteMetadataProviderManager implements MetadataProviderManager{

    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor()
    final static Logger LOG = LoggerFactory.getLogger(this)

    final DataSetRepository  dataSetRepository
    Map<Integer, MetadataCrawler> crawlers = [:]

    ConcreteMetadataProviderManager(DataSetRepository dataSetRepository){
        this.dataSetRepository = dataSetRepository
    }

    @Override
    MetadataProviderManager registerCrawler(crawler) {
        LOG.info("registing crawler $crawler ($crawler.providerId)")
        crawlers.put(crawler.providerId,crawler)
        return this
    }

    @Override
    def start() {
        executor.scheduleWithFixedDelay(new FetchMetadataWorker(), 0L, SepalConfiguration.instance.crawlerRunDelay, TimeUnit.HOURS)
    }



    private class FetchMetadataWorker implements Runnable{

        @Override
        void run() {
            dataSetRepository.getMetadataProviders().each{
                def crawler = crawlers.get(it.id)
                if (crawler){
                    try{
                        LOG.debug("Invoking crawl($it) on $crawler")
                        dataSetRepository.updateCrawlingStartTime(it.id,new Date())
                        crawler.crawl(it)
                    }catch (Exception ex){
                        LOG.error("Error during crawling with $crawler",ex)
                    }finally{
                        dataSetRepository.updateCrawlingEndTime(it.id,new Date())
                    }

                }else{
                    LOG.info("No crawler found for $it")
                }
            }
        }
    }

}