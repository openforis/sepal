package unit.crawling

import endtoend.SepalDriver
import org.openforis.sepal.metadata.MetadataProvider
import org.openforis.sepal.metadata.UsgsDataRepository
import org.openforis.sepal.metadata.crawling.EarthExplorerMetadataCrawler
import org.openforis.sepal.metadata.crawling.MetadataCrawler
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.util.DateTime
import org.openforis.sepal.util.ResourceLocator
import org.openforis.sepal.util.XmlUtils
import spock.lang.Shared
import spock.lang.Specification

class EarthExplorerMetadataCrawlerTest extends Specification {

    def static PROVIDER_ID = 1


    ResourceLocator httpDownloader = Mock(ResourceLocator)
    def usgsRepo = Mock(UsgsDataRepository)
    MetadataCrawler metaCrawler
    @Shared SepalDriver sepalDriver

    def setupSpec() {
        sepalDriver = new SepalDriver()
    }

    def cleanupSpec() {
        sepalDriver.stop()
    }

    def setup() {
        metaCrawler = new EarthExplorerMetadataCrawler(usgsRepo, httpDownloader)
    }

    def 'giving instructions to iterate 0 times, the crawler will not invoke .download(HttpDownloader)'() {
        given:
        MetadataProvider metaProvider = new MetadataProvider(id: PROVIDER_ID, active: 1, iterations: 0, iterationSize: 12)
        when:
        metaCrawler.crawl(metaProvider)
        then:
        0 * httpDownloader.download(_ as String, _ as Closure)
    }

    def 'giving instructions to iterate 3 times, the crawler will invoke .download(HttpDownloader)3 times for each dataset'() {
        given:
        MetadataProvider provider = new MetadataProvider(entrypoint: 'http://some_endpoint.org', id: PROVIDER_ID, active: 1, iterations: 3, iterationSize: 12)
        provider.dataSets = [DataSet.LANDSAT_8, DataSet.LANDSAT_COMBINED]
        when:
        metaCrawler.crawl(provider)
        then:
        6 * httpDownloader.download(_ as String, _ as Closure)
    }

    def 'parsing metadata for the first time. The crawler will try to insert each row and update noOne'() {
        given:
        httpDownloader = new MockResourceLocator()
        metaCrawler = new EarthExplorerMetadataCrawler(usgsRepo, httpDownloader)
        MetadataProvider provider = new MetadataProvider(entrypoint: 'http://some_endpoint.org', id: PROVIDER_ID, active: 1, iterations: 1, iterationSize: 1)
        provider.dataSets = [DataSet.LANDSAT_8]
        def metadataCount = new XmlSlurper().parse(EarthExplorerMetadataCrawlerTest.getResourceAsStream("/metadata.xml")).depthFirst().findAll {
            it.name() == 'metaData'
        }.size()
        when:
        metaCrawler.crawl(provider)
        then:
        0 * usgsRepo.updateMetadata(_, _)
        metadataCount * usgsRepo.storeMetadata(DataSet.LANDSAT_8.id, _ as Map)
    }

    def 'parsing a second file with different updateDate for an entry, will force the crawler to invoke the update method'() {
        given:
        httpDownloader = new MockResourceLocator()
        usgsRepo = new UsgsRepositoryBackedByMap()
        metaCrawler = new EarthExplorerMetadataCrawler(usgsRepo, httpDownloader)
        MetadataProvider provider = new MetadataProvider(entrypoint: 'http://some_endpoint.org', id: PROVIDER_ID, active: 1, iterations: 1, iterationSize: 1)
        MetadataProvider provider2 = new MetadataProvider(entrypoint: 'ftp://some_endpoint.org', id: 2, active: 1, iterations: 1, iterationSize: 1)
        provider.dataSets = [DataSet.LANDSAT_8]
        provider2.dataSets = [DataSet.LANDSAT_8]

        def metadataEdited = XmlUtils.getAllNodeWithTagName(EarthExplorerMetadataCrawlerTest.getResourceAsStream("/metadata_edited.xml"), "metaData")
        def iterator = metadataEdited.iterator()
        def first = XmlUtils.nodeToMap(iterator.next())
        def second = XmlUtils.nodeToMap(iterator.next())
        when:
        metaCrawler.crawl(provider)
        metaCrawler.crawl(provider2)
        def updatedData = usgsRepo.getSceneMetadata(1, first.sceneID)
        def untouchedData = usgsRepo.getSceneMetadata(1, second.sceneID)
        then:
        updatedData.dateUpdated == DateTime.parseDateString(first.dateUpdated)
        untouchedData.dateUpdated > DateTime.parseDateString(second.dateUpdated)
    }

    def 'parsing a file containing entry with null dates, the parser will not throw any exception'() {
        metaCrawler = new EarthExplorerMetadataCrawler(usgsRepo, new YAMRL())
        MetadataProvider provider = new MetadataProvider(entrypoint: 'http://some_endpoint.org', id: PROVIDER_ID, active: 1, iterations: 1, iterationSize: 1)
        provider.dataSets = [DataSet.LANDSAT_8]
        when:
        metaCrawler.crawl(provider)
        then:
        notThrown(Exception)
    }

    class MockResourceLocator implements ResourceLocator {
        @Override
        def download(String resourceURI, Closure callback) {
            def fileName = resourceURI.startsWith('http') ? "/metadata.xml" : '/metadata_edited.xml'
            MockResourceLocator.getResourceAsStream(fileName).withCloseable {
                callback(it)
            }
        }
    }

    class YAMRL implements ResourceLocator {
        @Override
        def download(String resourceURI, Closure callback) {
            MockResourceLocator.getResourceAsStream("/metadata_test_dates.xml").withCloseable {
                callback(it)
            }
        }
    }

    class UsgsRepositoryBackedByMap implements UsgsDataRepository {

        def map = [:]

        @Override
        def getSceneMetadata(Object dataSetId, Object sceneId) {
            def object = map.find { it.value.sceneID == sceneId }
            if (object) {
                object = [sceneID: sceneId, dateUpdated: object.value.dateUpdated, id: object.key]
            }
            return object
        }

        @Override
        def storeMetadata(Object dataSetId, Object metadata) {
            map.put(map.size() + 1, [dateUpdated: DateTime.parseDateString(metadata.dateUpdated), sceneID: metadata.sceneID])
        }

        @Override
        def updateMetadata(Object rowId, Object metadata) {
            map.get(rowId).dateUpdated = DateTime.parseDateString(metadata.dateUpdated)
        }
    }
}


