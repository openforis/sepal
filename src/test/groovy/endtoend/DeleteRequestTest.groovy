package endtoend

import spock.lang.Specification

class DeleteRequestTest extends Specification {

    private static final USERNAME = 'Test.User'
    private static final DATASET_ID = 1
    private static final SCENE_ID = 'L8_SCENE_ID'

    private static SepalDriver driver = new SepalDriver()
            .withUsers(USERNAME)
            .withActiveDataSets(DATASET_ID)


    def cleanupSpec() {
        driver.stop()
    }

    def setupSpec() {
        def request = [
                username : USERNAME,
                dataSetId: DATASET_ID,
                sceneIds : [SCENE_ID, SCENE_ID]
        ]
        driver.postDownloadRequests(request)
    }


    @SuppressWarnings("GroovyAssignabilityCheck")
    def 'Given a request with two scenes, once 1 is removed, the DB query should return the remaining one'() {
        when:
        driver.sendDeleteRequestScene(1, 1)
        def userRequests = driver.getDownloadRequests(USERNAME)
        then:
        userRequests.data.size == 1
        def responseRequest = userRequests.data[0]
        responseRequest.requestId == 1
        def requestScene = responseRequest.scenes[0]
        responseRequest.scenes.size == 1
        requestScene.id == 2
        requestScene.sceneId == SCENE_ID
    }


    def 'Given a valid requestId, the request is successfully deleted'() {
        when:
        driver.sendDeleteRequest(1)
        def userRequests = driver.getDownloadRequests(USERNAME)
        then:
        userRequests.data.size == 0
    }


}
