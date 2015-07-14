package unit

import org.openforis.sepal.SceneManager
import org.openforis.sepal.sceneretrieval.processor.SceneProcessor
import org.openforis.sepal.sceneretrieval.provider.DataSet
import org.openforis.sepal.sceneretrieval.provider.SceneProvider
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.sceneretrieval.publisher.ScenePublisher
import org.openforis.sepal.scenesdownload.DownloadRequest
import org.openforis.sepal.scenesdownload.RequestScenesDownloadCommand
import org.openforis.sepal.scenesdownload.ScenesDownloadRepository
import spock.lang.Specification

import static org.openforis.sepal.scenesdownload.DownloadRequest.SceneStatus.*

class SceneManagerTest extends Specification {
    private static final USERNAME = 'Test.User'
    private static final DATASET_ID = 1
    private static final SCENE_ID = 'LL123456'

    def sceneProvider = Mock(SceneProvider)
    def repo = new MockSceneDownloadRepository()
    def processor = Mock(SceneProcessor)
    def publisher = Mock(ScenePublisher)
    def manager = new SceneManager(sceneProvider, processor, publisher, repo)

    def request = new SceneRequest(1, new SceneReference(SCENE_ID, DataSet.byId(DATASET_ID)), USERNAME)

    def 'When a download request is submitted, the scene provider should be invoked'() {
        when:
        manager.sceneStatusChanged(request, REQUESTED)

        then:
        1 * sceneProvider.retrieve([request])

    }

    def 'When a scene download finish, the processor should be invoked'() {
        when:
        manager.sceneStatusChanged(request, DOWNLOADED)

        then:
        1 * processor.processScene(request)
    }

    def 'When a scene processing finish, the publisher should be invoked'() {
        when:
        manager.sceneStatusChanged(request, PROCESSED)

        then:
        1 * publisher.publishScene(request)
    }


}

class MockSceneDownloadRepository implements ScenesDownloadRepository {

    @Override
    void saveDownloadRequest(RequestScenesDownloadCommand requestScenesDownload) {

    }

    @Override
    List<DownloadRequest> getNewDownloadRequests() {
        return null
    }

    @Override
    int updateSceneStatus(long requestId, String sceneId, DownloadRequest.SceneStatus status) {
        return 0
    }

    @Override
    List<DownloadRequest> findUserRequests(String username) {
        return null
    }

    @Override
    void sceneStatusChanged(SceneRequest request, DownloadRequest.SceneStatus status) {

    }
}



