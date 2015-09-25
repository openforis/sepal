package integration.crawling

import endtoend.Sepal
import endtoend.SepalDriver
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

import static org.openforis.sepal.util.XmlUtils.*
import static org.openforis.sepal.util.DateTime.*

// Check starttime and endtime db saving
class MetadataCrawlingIntegrationTest extends Specification{

    private static def PROVIDER_ID = 1

    @Shared def driver
    @Shared UsgsDataRepository usgsRepository
    @Shared DataSetRepository dataSetRepository
    @Shared MetadataProviderManager metadataManager
    @Shared def earthExplorerCrawler


    def cleanupSpec(){
        driver.stop()
    }

    def setupSpec(){
        driver = new SepalDriver()
        usgsRepository = new JDBCUsgsDataRepository(driver.SQLManager)
        dataSetRepository = new JdbcDataSetRepository(driver.SQLManager)
        metadataManager = new ConcreteMetadataProviderManager(dataSetRepository)
        earthExplorerCrawler = new EarthExplorerMetadataCrawler(usgsRepository,new MockResourceLocator())

        driver.withActiveDataSet(DataSet.LANDSAT_8.id,PROVIDER_ID)
        driver.withMetadataProvider(PROVIDER_ID,"IntegrationTestMetaProvider")


    }

    def 'Succesfully obtaining resource from the ResourceLocator, store them in the database and be able to retrieve'(){
        given:
        InputStream is = MetadataCrawlingIntegrationTest.getResourceAsStream("/metadata.xml")
        Map firstNodeMap = nodeToMap(getAllNodeWithTagName(is,"metaData").first())
        def sceneID = firstNodeMap.sceneID
        def starttime = parseEarthExplorerDateString(firstNodeMap.sceneStartTime)
        def endtime = parseEarthExplorerDateString(firstNodeMap.sceneStopTime)
        when:
        metadataManager.registerCrawler(earthExplorerCrawler)
        metadataManager.start()
        then:
        new PollingConditions(timeout:12, initialDelay: 2, factor: 1.25).eventually {
            def dataRow = usgsRepository.getSceneMetadata(DataSet.LANDSAT_8.id, sceneID)
            def metadataProvider = dataSetRepository.metadataProviders.first()
            dataRow
            dataRow.sceneStartTime == starttime
            dataRow.sceneStopTime == endtime
            metadataProvider.lastStartTime
            metadataProvider.lastEndTime
        }
    }




    class MockResourceLocator implements ResourceLocator{
        @Override
        def download(String resourceURI, Closure callback) {
            MockResourceLocator.getResourceAsStream("/metadata.xml").withCloseable {
                callback(it)
            }
        }
    }




}
