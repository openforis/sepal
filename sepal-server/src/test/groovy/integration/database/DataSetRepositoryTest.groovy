package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.management.DataSetRepository
import org.openforis.sepal.scene.management.JdbcDataSetRepository
import org.openforis.sepal.util.DateTime
import spock.lang.Specification

class DataSetRepositoryTest extends Specification {

    def static final METADATA_PROVIDER = 1
    def static final METADATA_PROVIDER_2 = 2
    def static final SOME_CRITERIA = "SomeCriteria"
    def static final SOME_CRITERIA_TEST = "12"

    def static SepalDriver driver = new SepalDriver()

    def static DataSetRepository dataSetRepo = new JdbcDataSetRepository(driver.SQLManager)


    def cleanupSpec() {
        driver.stop()
    }

    def setupSpec() {
        driver.withMetadataProvider(METADATA_PROVIDER, "TestMetaProvider")

        driver.withActiveDataSet(DataSet.LANDSAT_8.id, METADATA_PROVIDER)
        driver.withActiveDataSet(DataSet.LANDSAT_ETM.id, METADATA_PROVIDER)
    }


    def 'Given  an existing dataset, you should be able to retrieve that row'() {
        when:
            dataSetRepo.metadataProviders
        then:
            dataSetRepo.containsDataSetWithId(DataSet.LANDSAT_8.id)
            !dataSetRepo.containsDataSetWithId(DataSet.LANDSAT_ETM_SLC_OFF.id)
    }

    def 'Linking a dataset to a metadataProvider, you should be able to fetch DP in the MP dataset list'() {
        when:
            def metadataProvider = dataSetRepo.metadataProviders
        then:
            metadataProvider.size() == 1
            metadataProvider.first().dataSets
            metadataProvider.first().dataSets.size() == 2
    }

    def 'Storing crawler start and end time. When a query is performed for a particula provider data is returned'() {
        given:
            Date startDate = new Date()
            Date endDate = DateTime.addDays(startDate, 1)
        when:
            dataSetRepo.updateCrawlingStartTime(METADATA_PROVIDER, startDate)
            dataSetRepo.updateCrawlingEndTime(METADATA_PROVIDER, endDate)
            def metadataProvider = dataSetRepo.getMetadataProviders().first()
        then:
            metadataProvider.lastEndTime == endDate
            metadataProvider.lastStartTime == startDate
    }

    def 'Setting up a criteria for a given metadataProvider, it is retrieved by the query'() {
        given:
            driver.withCrawlingCriteria(METADATA_PROVIDER, SOME_CRITERIA, SOME_CRITERIA_TEST)
        when:
            def results = dataSetRepo.metadataProviders
        then:
            results.size() == 1
            results.first().dataSets.size() == 2
            results.first().crawlingCriterias
            results.first().crawlingCriterias.size() == 1
            results.first().crawlingCriterias.first().expectedValue == SOME_CRITERIA_TEST
            results.first().crawlingCriterias.first().fieldName == SOME_CRITERIA
    }


    def 'Setting up a real dataSet/Provider/criteria scenario. The DAO behave correctly'() {
        given:
            driver.withMetadataProvider(METADATA_PROVIDER_2, "PlanetLabs", false)
            driver.withActiveDataSet(DataSet.LANDSAT_ETM_SLC_OFF.id, METADATA_PROVIDER)
            driver.withActiveDataSet(DataSet.LANDSAT_TM.id, METADATA_PROVIDER)
            driver.withActiveDataSet(DataSet.LANDSAT_MSS.id, METADATA_PROVIDER)
            driver.withActiveDataSet(DataSet.LANDSAT_MSS1.id, METADATA_PROVIDER)
            driver.withActiveDataSet(DataSet.LANDSAT_COMBINED.id, METADATA_PROVIDER)
            driver.withActiveDataSet(DataSet.LANDSAT_COMBINED78.id, METADATA_PROVIDER)
            driver.withActiveDataSet(DataSet.PLANET_LAB_SCENES.id, METADATA_PROVIDER_2)
        when:
            def providers = dataSetRepo.getMetadataProviders()
        then:
            providers
            providers.size() == 1
            providers.first().dataSets
            providers.first().dataSets.size() == 8
    }


}
