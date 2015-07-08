package unit.dataprovider

import org.openforis.sepal.sceneretrieval.provider.SceneProvider
import org.openforis.sepal.sceneretrieval.provider.DataSet
import org.openforis.sepal.sceneretrieval.provider.DelegatingSceneProvider
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import spock.lang.Specification

class DelegatingSceneProviderTest extends Specification {
    def requestId = 1L
    def username = 'Test.User'
    def dataSet = DataSet.LANDSAT_8

    def 'Retrieves scenes from '() {
        def provider1 = Mock(SceneProvider)
        def provider2 = Mock(SceneProvider)
        def provider3 = Mock(SceneProvider)
        def provider4 = Mock(SceneProvider)
        def delegating = new DelegatingSceneProvider([provider1, provider2, provider3, provider4])
        def scenes = [new SceneReference('first', dataSet), new SceneReference('last', dataSet)]

        when:
            delegating.retrieve(requestId,username, scenes)

        then: 'None retrievable'
            1 * provider1.retrieve(requestId,username, scenes) >> scenes
        then: 'Last retrievable'
            1 * provider2.retrieve(requestId,username, scenes) >> [scenes.first()]
        then: 'First retrievable'
            1 * provider3.retrieve(requestId,username, [scenes.first()]) >> []
        then: 'No scenes left to retrieve - provider not invoked'
            0 * provider4.retrieve(_)
    }
}
