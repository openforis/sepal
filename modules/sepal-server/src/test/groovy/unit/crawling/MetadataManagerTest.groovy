package unit.crawling

import endtoend.SepalDriver
import org.openforis.sepal.metadata.ConcreteMetadataProviderManager
import org.openforis.sepal.metadata.MetadataProvider
import org.openforis.sepal.metadata.MetadataProviderManager
import org.openforis.sepal.metadata.crawling.MetadataCrawler
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.management.DataSetRepository
import spock.lang.Shared
import spock.lang.Specification

class MetadataManagerTest extends Specification {
    static PROVIDER_ID = 2

    DataSetRepository dataSetRepository
    MetadataProviderManager metadataManager
    MetadataCrawler metadataCrawler
    MetadataCrawler metadataCrawler2
    @Shared SepalDriver sepalDriver

    def setupSpec() {
        sepalDriver = new SepalDriver()
    }

    def cleanupSpec() {
        sepalDriver.stop()
    }

    def setup() {
        metadataCrawler = Mock(MetadataCrawler)
        metadataCrawler.getProviderId() >> { PROVIDER_ID }

        metadataCrawler2 = Mock(MetadataCrawler)
        metadataCrawler2.getProviderId() >> { 445 }

        dataSetRepository = Mock(DataSetRepository)
        dataSetRepository.getMetadataProviders() >> {
            [new MetadataProvider(id: PROVIDER_ID, active: 1, dataSets: [DataSet.LANDSAT_8])]
        }

        metadataManager = new ConcreteMetadataProviderManager(dataSetRepository)
    }

    def 'registering a crawler for a given dataset The crawl method should be executed'() {
        when:
        metadataManager.registerCrawler(metadataCrawler).registerCrawler(metadataCrawler2)
        metadataManager.start()
        sleep(2000)
        then:
        1 * metadataCrawler.crawl(_)
        0 * metadataCrawler2.crawl(_)
    }


}



