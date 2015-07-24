package unit

import org.openforis.sepal.scene.*
import org.openforis.sepal.scene.management.SceneManager
import org.openforis.sepal.scene.management.ScenesDownloadRepository
import spock.lang.Specification

import static org.openforis.sepal.scene.SceneStatus.*

class SceneManagerTest extends Specification {
    private static final USERNAME = 'Test.User'
    private static final DATASET_ID = 1
    private static final SCENE_ID = 'LL123456'

    def sceneProvider = Mock(SceneProvider)
    def repo = Mock(ScenesDownloadRepository)
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



