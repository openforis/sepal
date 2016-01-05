package integration.database

import endtoend.SepalDriver
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.scene.DownloadRequest
import org.openforis.sepal.scene.SceneRequest
import org.openforis.sepal.scene.management.JdbcScenesDownloadRepository
import org.openforis.sepal.scene.management.RequestScenesDownloadCommand
import org.openforis.sepal.scene.management.ScenesDownloadRepository
import spock.lang.Shared
import spock.lang.Specification

import static org.openforis.sepal.scene.Status.REQUESTED
import static org.openforis.sepal.scene.Status.UNKNOWN

class ScenesDownloadRepositoryTest extends Specification {
    static final def DATASET_ID = 1
    static final def PROCESSING_CHAIN = "LANDSAT_8/chain.sh"
    static final def SCENE_IDS = ["one", "two", "three"]
    static final def USER = "Test.User"
    static final def REQ_NAME = "REQUEST"
    static final def USER2 = "Test.User2"

    @Shared SepalDriver driver
    @Shared ScenesDownloadRepository scenesDownloadRepository

    def setupSpec() {
        driver = new SepalDriver()
        scenesDownloadRepository = new JdbcScenesDownloadRepository(driver.getSQLManager())
    }

    def setup() {
        insertRequest()
    }

    def cleanup() {
        driver.resetDatabase()
    }

    def cleanupSpec() {
        driver.stop()
    }

    def 'Once a downloadRequest comes in. The insert and the next fetch should behaves correctly'() {
        when:
        List<DownloadRequest> requests = scenesDownloadRepository.getNewDownloadRequests()
        then:
        requests.size() == 1
        def request = requests.first()
        request.requestName == REQ_NAME
        request.status == REQUESTED
        !request.groupScenes
        request.scenes.size() == 3
        def scene = request.scenes.first()
        scene.processingChain == PROCESSING_CHAIN
        scene.status == REQUESTED
        scene.sceneReference.id == SCENE_IDS.first()
    }

    def 'Once the request status is updated, that row is not returned anymore from getNewDownloadRequests() method'() {
        when:
        List<DownloadRequest> requestsBefore = scenesDownloadRepository.getNewDownloadRequests()
        scenesDownloadRepository.updateRequestStatus(1, UNKNOWN)
        List<DownloadRequest> requestsAfter = scenesDownloadRepository.getNewDownloadRequests()
        then:
        requestsAfter.size() == 0
        requestsBefore.size() == 1
    }

    def 'Updating scene status works'() {
        when:
        SceneRequest sceneBefore = scenesDownloadRepository.getNewDownloadRequests().first().scenes.first()
        scenesDownloadRepository.updateSceneStatus(sceneBefore.id, UNKNOWN)
        SceneRequest sceneAfter = scenesDownloadRepository.getNewDownloadRequests().first().scenes.first()
        then:
        sceneBefore.status == REQUESTED
        sceneAfter.status == UNKNOWN
    }

    def 'Checking whether every single scene in a request has the same status works'() {
        when:
        SceneRequest scene = scenesDownloadRepository.getNewDownloadRequests().first().scenes.first()
        Boolean sameStatusBefore = scenesDownloadRepository.hasStatus(1, REQUESTED)
        scenesDownloadRepository.updateSceneStatus(scene.id, UNKNOWN)
        Boolean sameStatusAfter = scenesDownloadRepository.hasStatus(1, REQUESTED)
        then:
        sameStatusBefore
        !sameStatusAfter
    }

    def 'Performing a query the get user requests works well'() {
        given:
        def userRequestsBefore = scenesDownloadRepository.findUserRequests(USER)
        when:
        insertRequest(USER, 'A req')
        insertRequest(USER2)
        def userRequestsAfter = scenesDownloadRepository.findUserRequests(USER)
        then:
        userRequestsBefore.size() == 1
        userRequestsAfter.size() == 2
    }

    def 'Checking whether deleteRequest method works'() {
        given:
        def requests = scenesDownloadRepository.newDownloadRequests
        when:
        scenesDownloadRepository.deleteRequest(1)
        def requestsAfter = scenesDownloadRepository.newDownloadRequests
        then:
        requests.size() == 1
        requestsAfter.size() == 0
    }

    def 'Checking whether deleteScene method works'() {
        given:
        def requests = scenesDownloadRepository.newDownloadRequests
        when:
        scenesDownloadRepository.deleteScene(1, 1)
        def requestsAfter = scenesDownloadRepository.newDownloadRequests
        then:
        requests.size() == 1
        requestsAfter.size() == 1
        requests.first().scenes.size() == 3
        requestsAfter.first().scenes.size() == 2
    }

    def 'Checking wheter reloadRequestData method works'() {
        given:
        def request = scenesDownloadRepository.getNewDownloadRequests().first()
        def reqId = request.requestId
        when:
        request.dataSet = null
        request.processingChain = null
        scenesDownloadRepository.reloadRequestData(request)
        then:
        request.dataSet == DataSet.byId(DATASET_ID)
        request.processingChain == PROCESSING_CHAIN
        reqId == request.requestId

    }

    def 'Trying to insert a request for a user using the same request name, will fail'() {
        when:
        insertRequest()
        then:
        thrown(Exception)
    }

    def 'Trying to insert a request for another user using an already existent request name, will succeed'() {
        when:
        insertRequest(USER2)
        then:
        notThrown(Exception)
    }

    private void insertRequest(def userName = USER, def requestName = REQ_NAME) {
        RequestScenesDownloadCommand downloadCommand = new RequestScenesDownloadCommand(
                dataSetId: DATASET_ID,
                processingChain: PROCESSING_CHAIN,
                groupScenes: false,
                sceneIds: SCENE_IDS,
                username: userName,
                requestName: requestName
        )
        scenesDownloadRepository.saveDownloadRequest(downloadCommand)
    }

}
