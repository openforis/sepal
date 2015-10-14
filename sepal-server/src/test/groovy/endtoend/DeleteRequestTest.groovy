package endtoend

import spock.lang.Shared
import spock.lang.Specification

class DeleteRequestTest extends Specification {

    private static final USERNAME = 'Test.User'
    private static final DATASET_ID = 1
    private static final SCENE_ID = 'L8_SCENE_ID'

    @Shared private SepalDriver driver
    @Shared private Integer declaredRequestId
    @Shared private Integer declaredRequestedSceneId
    @Shared private Integer expectedRequestedSceneId


    def cleanupSpec() {
        driver.stop()

    }

    def setupSpec() {
        driver = new SepalDriver()
                .withUsers(USERNAME)
                .withActiveDataSets(DATASET_ID)
        def request = [
                username : USERNAME,
                dataSetId: DATASET_ID,
                sceneIds : [SCENE_ID, SCENE_ID]
        ]
       driver.postDownloadRequests(request)
       def downloadRequest =  driver.getDownloadRequests(USERNAME).data[0]
       declaredRequestId = downloadRequest.requestId
       declaredRequestedSceneId = downloadRequest.scenes[0].id
       expectedRequestedSceneId = downloadRequest.scenes[1].id
    }


    @SuppressWarnings("GroovyAssignabilityCheck")
    def 'Given a request with two scenes, once 1 is removed, the DB query should return the remaining one'() {
        when:
            driver.sendDeleteRequestScene(declaredRequestId, declaredRequestedSceneId)
            def userRequests = driver.getDownloadRequests(USERNAME)
        then:
            userRequests.data.size == 1
            def responseRequest = userRequests.data[0]
            responseRequest.requestId == declaredRequestId
            def requestScene = responseRequest.scenes[0]
            responseRequest.scenes.size == 1
            requestScene.id == expectedRequestedSceneId
            requestScene.sceneId == SCENE_ID
    }


    def 'Given a valid requestId, the request is successfully deleted'() {
        when:
            driver.sendDeleteRequest(declaredRequestId)
            def userRequests = driver.getDownloadRequests(USERNAME)
        then:
            userRequests.data.size == 0
    }


}
