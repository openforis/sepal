package datasearch

import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.api.AutomaticSceneSelectingMapQuery
import org.openforis.sepal.component.datasearch.api.FusionTableAoi
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.api.MapLayer
import org.openforis.sepal.component.datasearch.api.PreselectedScenesMapQuery

class FakeGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final Map<FusionTableAoi, Collection<SceneArea>> sceneAreasByFusionTable = [:]


    Collection<SceneArea> findSceneAreasInAoi(FusionTableAoi aoi) {
        return sceneAreasByFusionTable[aoi]
    }

    MapLayer preview(AutomaticSceneSelectingMapQuery query) {
        return null
    }

    MapLayer preview(PreselectedScenesMapQuery query) {
        return null
    }

    List<SceneArea> areas(String fusionTable, String keyColumn, String keyValue, List<SceneArea> sceneAreas) {
        sceneAreasByFusionTable[new FusionTableAoi(fusionTable, keyColumn, keyValue)] = sceneAreas
        return sceneAreas
    }
}
