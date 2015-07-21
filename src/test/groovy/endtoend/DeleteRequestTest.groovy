package endtoend

import org.openforis.sepal.scene.management.RequestScenesDownloadCommand
import spock.lang.Shared
import spock.lang.Specification


class DeleteRequestTest extends Specification {

    private static final USERNAME = 'Test.User'
    private static final DATASET_ID = 1
    private static final INVALID_REQUEST_ID = 20
    private static final SCENE_ID = 'L8_SCENE_ID'
    private static final RequestScenesDownloadCommand downloadRequest = new RequestScenesDownloadCommand(username: USERNAME, dataSetId: DATASET_ID, sceneIds: [SCENE_ID])


    private static SepalDriver driver = new SepalDriver()
            .withUsers(USERNAME)
            .withActiveDataSets(DATASET_ID)


    def cleanupSpec() {
        driver.stop()
    }

    def setupSpec(){
        def request = [
                username   : USERNAME,
                dataSetId: DATASET_ID,
                sceneIds : [SCENE_ID,SCENE_ID]
        ]
        driver.postDownloadRequests(request)
    }

    def 'Given an invalid requestId, the delete request should fail'(){
        when:
        def response = driver.sendDeleteRequest(INVALID_REQUEST_ID)
        then:
        def e = thrown(FailedRequest)
        e.response.status == 400
    }

    def 'Given an invalid sceneId, the scene is not removed'(){
        when:
        driver.sendDeleteRequestScene(1,4)
        then:
        def e = thrown(FailedRequest)
        e.response.status == 400
    }

    def 'Given a request with two scenes, once 1 is removed, the DB query should return the remaining one'(){
        when:
        driver.sendDeleteRequestScene(1,1)
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




    def 'Given a valid requestId, the request is successfully deleted'(){
        when:
        driver.sendDeleteRequest(1)
        def userRequests = driver.getDownloadRequests(USERNAME)
        then:
        userRequests.data.size == 0
    }





}
