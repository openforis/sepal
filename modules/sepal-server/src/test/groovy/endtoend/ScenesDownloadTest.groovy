package endtoend

import spock.lang.Shared
import spock.lang.Specification

class ScenesDownloadTest extends Specification {
    static final USERNAME = 'Test.User'
    static final DATASET_ID = 1
    static final INVALID_DATASET_ID = 20

    @Shared SepalDriver driver

    def setupSpec() {
        driver = new SepalDriver()
    }

    def cleanupSpec() {
        driver.stop()
    }

    def cleanup() {
        driver.resetDatabase()
    }

    def setup() {
        driver.withUsers(USERNAME).withActiveDataSets(DATASET_ID)
    }

    def 'Given a request with a valid request name, the service reply with HTTP Status 200'() {
        given:
        def request = [
                username: USERNAME,
                dataSetId: DATASET_ID,
                sceneIds: ["LC12"],
                groupScenes: true,
                requestName: "validRequestName"
        ]
        when:
        def response = driver.postDownloadRequests(request)

        then:
        response.status == 200
    }

    def 'Given a request with an invalid request name, the service reply with HTTP Status 400'() {
        given:
        def request = [
                username: USERNAME,
                dataSetId: DATASET_ID,
                sceneIds: ["LC12"],
                groupScenes: true,
                requestName: "Un%validRequestName"
        ]
        when:
        driver.postDownloadRequests(request)
        then:
        def e = thrown(FailedRequest)
        e.response.status == 400
        e.message.contains("requestName")

    }

    def 'Given no download requests, when getting download requests, none are returned'() {
        when:
        def response = driver.getDownloadRequests(USERNAME)
        then:
        response.data == []
    }

    def 'Given a download request, when getting download requests, the request is returned'() {
        def request = [
                username: USERNAME,
                dataSetId: DATASET_ID,
                sceneIds: ['the scene id']
        ]
        driver.postDownloadRequests(request)

        when:
        def response = driver.getDownloadRequests(USERNAME)
        then:
        def requests = response.data as Map
        requests.size() == 1

        requests.first().scenes.size() == 1
        requests.first().scenes.first().sceneReference.id == 'the scene id'
    }

    def 'Given a download request with invalid data set, 400 is returned'() {
        def request = [
                username: USERNAME,
                dataSetId: INVALID_DATASET_ID,
                sceneIds: ['the scene id']
        ]
        when:
        driver.postDownloadRequests(request)
        then:
        def e = thrown(FailedRequest)
        e.response.status == 400
    }

    def 'Given a download request without scenes, 400 is returned'() {
        def request = [
                username: USERNAME,
                dataSetId: DATASET_ID,
                sceneIds: []
        ]
        when:
        driver.postDownloadRequests(request)
        then:
        def e = thrown(FailedRequest)
        e.response.status == 400
        e.message.toLowerCase().contains('scene')
    }

    def 'Trying to post 2 request for the same user having the same RequestName, 400 is returned'() {
        given:
        def request = [
                username: USERNAME,
                dataSetId: DATASET_ID,
                sceneIds: ["LC12"],
                groupScenes: true,
                requestName: "validRequestNameTest"
        ]
        when:
        driver.postDownloadRequests(request)
        //request.requestName = request.requestName.toUpperCase()
        driver.postDownloadRequests(request)
        then:
        def e = thrown(FailedRequest)
        e.response.status == 400
        e.message.toLowerCase().contains('requestname')

    }
}
