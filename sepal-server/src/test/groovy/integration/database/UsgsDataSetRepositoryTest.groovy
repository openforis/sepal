package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.metadata.JDBCUsgsDataRepository
import org.openforis.sepal.metadata.UsgsDataRepository
import org.openforis.sepal.util.DateTime
import spock.lang.Shared
import spock.lang.Specification

class UsgsDataSetRepositoryTest extends Specification {

    def static final DATASET_ID = 1L
    def static final SCENE_ID = 'A_SCENE_ID'


    @Shared SepalDriver driver
    UsgsDataRepository usgsRepo
    @Shared def metadataScene


    def cleanupSpec() {
        driver.stop()
    }

    def setupSpec() {
        metadataScene = parseXml().first().children().collectEntries { [it.name(), it.text()] }
        metadataScene.sceneStartTime = DateTime.parseEarthExplorerDateString(metadataScene.sceneStartTime)
        metadataScene.sceneStopTime = DateTime.parseEarthExplorerDateString(metadataScene.sceneStopTime)
        driver = new SepalDriver()
    }

    def setup() {
        usgsRepo = new JDBCUsgsDataRepository(driver.getSQLManager())
    }

    def 'given an empty database, no result are returned from the usgsrepo'() {
        when:
            def dataset = usgsRepo.getSceneMetadata(DATASET_ID, SCENE_ID)
        then:
            !dataset
    }

    def 'storing a row in the metadata(usgsrepo) table. It is retrieved'() {
        given:
            def sceneId = metadataScene.sceneID
            def acquisitionDate = metadataScene.acquisitionDate
        when:
            usgsRepo.storeMetadata(DATASET_ID, metadataScene)
        then:
            def sceneMetadata = usgsRepo.getSceneMetadata(DATASET_ID, sceneId)
            sceneMetadata
            sceneMetadata.sceneID == sceneId
            DateTime.toDateString(sceneMetadata.acquisitionDate) == acquisitionDate


    }

    def 'trying to update a non existing row fails'() {
        when:
            def updatedRows = usgsRepo.updateMetadata(2, metadataScene)
        then:
            updatedRows == 0
    }

    def 'updating an existing row. The query would return the updated data'() {
        given:
            def sceneId = metadataScene.sceneID
        when:
            usgsRepo.storeMetadata(DATASET_ID, metadataScene)
            def retrievedScene = usgsRepo.getSceneMetadata(DATASET_ID, sceneId)
            metadataScene.cloudCover = 666
            def updates = usgsRepo.updateMetadata(retrievedScene.id, metadataScene)
            retrievedScene = usgsRepo.getSceneMetadata(DATASET_ID, sceneId)
        then:
            updates == 1
            retrievedScene
            retrievedScene.cloudCover == 666

    }

    def private parseXml() {
        def metadataFile = new XmlSlurper().parse(UsgsDataSetRepositoryTest.getResourceAsStream("/metadata.xml"))
        return metadataFile.depthFirst().findAll { it.name() == 'metaData' }
    }

}
