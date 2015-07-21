package endtoend

import spock.lang.Ignore
import spock.lang.Specification

class ScenesDownloadTest extends Specification {
    private static final USERNAME = 'Test.User'
    private static final DATASET_ID = 1
    private static final INVALID_DATASET_ID = 20

    private final SepalDriver driver = new SepalDriver()
            .withUsers(USERNAME)
            .withActiveDataSets(DATASET_ID)

    def cleanup() {
        driver.stop()
    }

    def 'Given no download requests, when getting download requests, none are returned'() {
        when:
            def response = driver.getDownloadRequests(USERNAME)
        then:
            response.data == []
    }

    def 'Given a download request, when getting download requests, the request is returned'() {
        def request = [
                username   : USERNAME,
                dataSetId: DATASET_ID,
                sceneIds : ['the scene id']
        ]
        driver.postDownloadRequests(request)

        when:
            def response = driver.getDownloadRequests(USERNAME)
        then:
            def requests = response.data as Map
            requests.size() == 1
            requests.first().scenes.size() == 1
            requests.first().scenes.first().sceneId == 'the scene id'
    }

    def 'Given a download request with invalid data set, 400 is returned'() {
        def request = [
                userId   : USERNAME,
                dataSetId: INVALID_DATASET_ID,
                sceneIds : ['the scene id']
        ]
        when:
            driver.postDownloadRequests(request)
        then:
            def e = thrown(FailedRequest)
            e.response.status == 400
    }

    def 'Given a download request without scenes, 400 is returned'() {
        def request = [
                userId   : USERNAME,
                dataSetId: DATASET_ID,
                sceneIds : []
        ]
        when:
            driver.postDownloadRequests(request)
        then:
            def e = thrown(FailedRequest)
            e.response.status == 400
            e.message.toLowerCase().contains('scene')
    }
}
