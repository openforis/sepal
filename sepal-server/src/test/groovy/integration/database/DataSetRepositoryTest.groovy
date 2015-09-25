package integration.database

import endtoend.Sepal
import endtoend.SepalDriver
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.management.DataSetRepository
import org.openforis.sepal.scene.management.JdbcDataSetRepository
import org.openforis.sepal.util.DateTime
import spock.lang.Specification

class DataSetRepositoryTest extends Specification{

    def static final METADATA_PROVIDER = 2

    def static SepalDriver driver = new SepalDriver()

    def static DataSetRepository dataSetRepo = new JdbcDataSetRepository(driver.SQLManager)


    def cleanupSpec() {
        driver.stop()
    }

    def setupSpec(){
        driver.withMetadataProvider(METADATA_PROVIDER,"TestMetaProvider")
    }




    def 'Given  an existing dataset, you should be able to retrieve that row'(){
        when:
            driver.withActiveDataSets(DataSet.LANDSAT_8.id)
        then:
            dataSetRepo.containsDataSetWithId(DataSet.LANDSAT_8.id)
            !dataSetRepo.containsDataSetWithId(DataSet.LANDSAT_ETM_SLC_OFF.id)
    }

    def 'Linking a dataset to a metadataProvider, you should be able to fetch DP in the MP dataset list' (){
        when:
            driver.withActiveDataSet(DataSet.LANDSAT_ETM_SLC_OFF.id,METADATA_PROVIDER)
            def metadataProvider = dataSetRepo.metadataProviders
        then:
            metadataProvider.size() == 1
            metadataProvider.dataSets
            metadataProvider.dataSets.size() == 1
            def dataSet = metadataProvider.get(0).dataSets.first()
            dataSet == DataSet.LANDSAT_ETM_SLC_OFF
    }

    def 'Storing crawler start and end time. When a query is performed for a particula provider data is returned'(){
        given:
        Date startDate = new Date()
        Date endDate = DateTime.addDays(startDate,1)
        when:
        dataSetRepo.updateCrawlingStartTime(METADATA_PROVIDER,startDate)
        dataSetRepo.updateCrawlingEndTime(METADATA_PROVIDER,endDate)
        def metadataProvider = dataSetRepo.getMetadataProviders().first()
        then:
        metadataProvider.lastEndTime == endDate
        metadataProvider.lastStartTime == startDate

    }


}
