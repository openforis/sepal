package component.datasearch

import org.openforis.sepal.component.datasearch.api.DataSet
import org.openforis.sepal.component.datasearch.api.SceneArea
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.user.User

class FakeGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final Map<Aoi, Collection<SceneArea>> sceneAreasByFusionTable = [:]


    Collection<SceneArea> findSceneAreasInAoi(DataSet dataSet, Aoi aoiUser, User user) {
        return sceneAreasByFusionTable[aoi]
    }

    MapLayer preview(AutomaticSceneSelectingMapQuery query, User user) {
        return null
    }

    MapLayer preview(PreselectedScenesMapQuery query, User user) {
        return null
    }

    List<SceneArea> areas(String fusionTable, String keyColumn, String keyValue, List<SceneArea> sceneAreas) {
        sceneAreasByFusionTable[new FusionTableShape(fusionTable, keyColumn, keyValue)] = sceneAreas
        return sceneAreas
    }
}
