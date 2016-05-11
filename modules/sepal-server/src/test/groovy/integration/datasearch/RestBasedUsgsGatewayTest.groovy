package integration.datasearch

import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.component.datasearch.usgs.RestBasedUsgsGateway
import org.openforis.sepal.util.DateTime
import spock.lang.Specification

class RestBasedUsgsGatewayTest extends Specification {
    def usgs = new RestBasedUsgsGateway()

    def 'Can retrieve Landsat scene metadata from yesterday'() {
        when:
        def date = DateTime.startOfDay(new Date()) - 1
        def scenes = [] as List<SceneMetaData>
        usgs.eachSceneUpdatedSince(date) {
            scenes.addAll(it)
        }

        then:
        !scenes.empty
        scenes.every { it.updateTime >= date }

    }
}
