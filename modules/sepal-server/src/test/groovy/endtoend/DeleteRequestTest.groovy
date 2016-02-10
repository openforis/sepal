package endtoend

import spock.lang.Shared
import spock.lang.Specification

@SuppressWarnings("GroovyAssignabilityCheck")
class DeleteRequestTest extends Specification {
    static final USERNAME = 'Test.User'
    static final DATASET_ID = 1
    static final SCENE_ID = 'L8_SCENE_ID'

    @Shared SepalDriver driver
    @Shared Integer declaredRequestId
    @Shared Integer declaredRequestedSceneId
    @Shared Integer expectedRequestedSceneId

    def setupSpec() {
        driver = new SepalDriver()
                .withUsers(USERNAME)
                .withActiveDataSets(DATASET_ID)
        def request = [
                username: USERNAME,
                dataSetId: DATASET_ID,
                sceneIds: [SCENE_ID, SCENE_ID]
        ]
        driver.postDownloadRequests(request)
        def downloadRequest = driver.getDownloadRequests(USERNAME).data[0]
        declaredRequestId = downloadRequest.requestId
        declaredRequestedSceneId = downloadRequest.scenes[0].id
        expectedRequestedSceneId = downloadRequest.scenes[1].id
    }

    def cleanupSpec() {
        driver.stop()
    }

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
        requestScene.sceneReference.id == SCENE_ID
    }

    def 'Given a valid requestId, the request is successfully deleted'() {
        when:
        driver.sendDeleteRequest(declaredRequestId)
        def userRequests = driver.getDownloadRequests(USERNAME)
        then:
        userRequests.data.size == 0
    }
}
