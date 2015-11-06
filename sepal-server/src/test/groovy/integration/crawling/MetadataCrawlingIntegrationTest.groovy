package integration.crawling

import endtoend.SepalDriver
import groovy.util.slurpersupport.GPathResult
import org.apache.commons.io.IOUtils
import org.openforis.sepal.metadata.ConcreteMetadataProviderManager
import org.openforis.sepal.metadata.JDBCUsgsDataRepository
import org.openforis.sepal.metadata.MetadataProviderManager
import org.openforis.sepal.metadata.UsgsDataRepository
import org.openforis.sepal.metadata.crawling.EarthExplorerMetadataCrawler
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.management.DataSetRepository
import org.openforis.sepal.scene.management.JdbcDataSetRepository
import org.openforis.sepal.util.ResourceLocator
import spock.lang.Shared
import spock.lang.Specification
import spock.util.concurrent.PollingConditions

import static org.openforis.sepal.util.DateTime.parseEarthExplorerDateString
import static org.openforis.sepal.util.XmlUtils.getAllNodeWithTagName
import static org.openforis.sepal.util.XmlUtils.nodeToMap

class MetadataCrawlingIntegrationTest extends Specification {
    static def PROVIDER_ID = 1
    static def CRITERIA_FIELD = "DATA_TYPE_L1"
    static def FIELD_VALUE = "L1T"
    static def CRITERIA_FIELD_2 = "path"
    static def FIELD_VALUE_2 = "93"

    @Shared
    SepalDriver driver
    @Shared
    UsgsDataRepository usgsRepository
    @Shared
    DataSetRepository dataSetRepository
    @Shared
    MetadataProviderManager metadataManager
    @Shared
    def earthExplorerCrawler
    @Shared
    List<GPathResult> gPathResults

    def cleanup() {
        driver.stop()
    }

    def setupSpec() {
        InputStream is = MetadataCrawlingIntegrationTest.getResourceAsStream("/metadata.xml")
        gPathResults = getAllNodeWithTagName(is, "metaData")
        IOUtils.closeQuietly(is)
    }


    def setup() {
        driver = new SepalDriver()
        usgsRepository = new JDBCUsgsDataRepository(driver.SQLManager)
        dataSetRepository = new JdbcDataSetRepository(driver.SQLManager)
        metadataManager = new ConcreteMetadataProviderManager(dataSetRepository)
        earthExplorerCrawler = new EarthExplorerMetadataCrawler(usgsRepository, new MockResourceLocator())

        driver.withActiveDataSet(DataSet.LANDSAT_8.id, PROVIDER_ID)
        driver.withMetadataProvider(PROVIDER_ID, "IntegrationTestMetaProvider")
    }

    def 'Succesfully obtaining resource from the ResourceLocator, store them in the database and be able to retrieve'() {
        given:
            Map firstNodeMap = nodeToMap(gPathResults.first())
            def sceneID = firstNodeMap.sceneID
            def starttime = parseEarthExplorerDateString(firstNodeMap.sceneStartTime)
            def endtime = parseEarthExplorerDateString(firstNodeMap.sceneStopTime)
        when:
            metadataManager.registerCrawler(earthExplorerCrawler)
            metadataManager.start()
        then:
            new PollingConditions(timeout: 12, initialDelay: 2, factor: 1.25).eventually {
                def dataRow = usgsRepository.getSceneMetadata(DataSet.LANDSAT_8.id, sceneID)
                def metadataProvider = dataSetRepository.metadataProviders.first()
                dataRow
                dataRow.sceneStartTime == starttime
                dataRow.sceneStopTime == endtime
                metadataProvider.lastStartTime
                metadataProvider.lastEndTime
            }
    }

    def 'Establishing crawling rules, they will be applied'() {
        given:
            driver.withCrawlingCriteria(PROVIDER_ID, CRITERIA_FIELD, FIELD_VALUE).withCrawlingCriteria(PROVIDER_ID, CRITERIA_FIELD_2, FIELD_VALUE_2)
        when:
            metadataManager.registerCrawler(earthExplorerCrawler)
            metadataManager.start()
        then:
            new PollingConditions(timeout: 12, initialDelay: 2, factor: 1.25).eventually {
                gPathResults?.each { result ->
                    Map nodeMap = nodeToMap(result)
                    def dataRow = usgsRepository.getSceneMetadata(DataSet.LANDSAT_8.id, nodeMap.sceneID)
                    def field1Value = nodeMap.get(CRITERIA_FIELD)
                    def field2Value = nodeMap.get(CRITERIA_FIELD_2)
                    if (field1Value == FIELD_VALUE && field2Value == FIELD_VALUE_2) {
                        dataRow
                    } else {
                        !dataRow
                    }
                }
            }
    }


    class MockResourceLocator implements ResourceLocator {
        @Override
        def download(String resourceURI, Closure callback) {
            MockResourceLocator.getResourceAsStream("/metadata.xml").withCloseable {
                callback(it)
            }
        }
    }


}
