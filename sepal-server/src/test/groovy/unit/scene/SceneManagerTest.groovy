package unit.scene

import org.openforis.sepal.scene.*
import org.openforis.sepal.scene.management.SceneManager
import org.openforis.sepal.scene.management.ScenesDownloadRepository
import spock.lang.Specification

import static org.openforis.sepal.scene.Status.*


class SceneManagerTest extends Specification {
    private static final USERNAME = 'Test.User'
    private static final DATASET_ID = 1
    private static final SCENE_ID = 'LL123456'

    def sceneProvider = Mock(SceneProvider)
    def repo = Mock(ScenesDownloadRepository)
    def processor = Mock(SceneProcessor)
    def publisher = Mock(ScenePublisher)
    def manager = new SceneManager(sceneProvider, processor, publisher, repo)


    def request = new DownloadRequest(requestId: 1L, groupScenes: false)
    def sceneRequest = new SceneRequest(1, new SceneReference(SCENE_ID, DataSet.byId(DATASET_ID)), USERNAME, new Date(), REQUESTED, request)
    def atomicRequest = new DownloadRequest(requestId: 2L, groupScenes: true, processingChain: "chain")

    def 'When a download request is submitted, the scene provider should be invoked'() {
        when:
            sceneRequest.request.scenes.add(sceneRequest)
            manager.sceneStatusChanged(sceneRequest, REQUESTED)

        then:
            1 * sceneProvider.retrieve([sceneRequest])

    }

    def 'When a scene download finish, the processor should be invoked'() {
        when:
            manager.sceneStatusChanged(sceneRequest, DOWNLOADED)

        then:
            1 * processor.process(sceneRequest)
    }

    def 'When a scene processing finish inside an atomic request, the publisher should be invoked'() {
        when:
            manager.requestStatusChanged(atomicRequest, PROCESSED)

        then:
            1 * publisher.publish(atomicRequest)
    }

    def 'When a scene download finish  inside an atomic request, the processor should be invoked'() {
        when:
        atomicRequest.scenes.add(sceneRequest)
        manager.requestStatusChanged(atomicRequest, DOWNLOADED)

        then:
        1 * processor.process(_ as DownloadRequest,_ as String)
    }

    def 'When a scene processing finish  inside an atomic request, the publisher should be invoked'() {
        when:
        manager.requestStatusChanged(atomicRequest, PROCESSED)

        then:
        1 * publisher.publish(atomicRequest)
    }




}



