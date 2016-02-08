package unit.scene.dataprovider

import org.openforis.sepal.component.dataprovider.*
import org.openforis.sepal.component.dataprovider.retrieval.provider.DispatchingSceneProvider
import spock.lang.Specification

class DispatchingSceneProviderTest extends Specification {
    def requestId = 1L
    def username = 'Test.User'
    def dataSet = DataSet.LANDSAT_8

    def 'Retrieves scenes from '() {
        def provider1 = Mock(SceneProvider)
        def provider2 = Mock(SceneProvider)
        def provider3 = Mock(SceneProvider)
        def provider4 = Mock(SceneProvider)
        def delegating = new DispatchingSceneProvider([provider1, provider2, provider3, provider4])
        def requests = [
                request('first', dataSet),
                request('last', dataSet)
        ]

        when:
        delegating.retrieve(requests)

        then: 'None retrievable'
        1 * provider1.retrieve(requests) >> requests
        then: 'Last retrievable'
        1 * provider2.retrieve(requests) >> [requests.first()]
        then: 'First retrievable'
        1 * provider3.retrieve([requests.first()]) >> []
        then: 'No scenes left to retrieve - provider not invoked'
        0 * provider4.retrieve(_)
    }

    SceneRequest request(String sceneId, DataSet dataSet) {
        new SceneRequest(requestId, new SceneReference(sceneId, dataSet), username, new Date(), Status.REQUESTED, new DownloadRequest(requestId: 1L, status: Status.REQUESTED))
    }
}
