package component.datasearch

import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.api.*

class FakeGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final Map<Aoi, Collection<SceneArea>> sceneAreasByFusionTable = [:]


    Collection<SceneArea> findSceneAreasInAoi(Aoi aoi) {
        return sceneAreasByFusionTable[aoi]
    }

    MapLayer preview(AutomaticSceneSelectingMapQuery query) {
        return null
    }

    MapLayer preview(PreselectedScenesMapQuery query) {
        return null
    }

    List<SceneArea> areas(String fusionTable, String keyColumn, String keyValue, List<SceneArea> sceneAreas) {
        sceneAreasByFusionTable[new FusionTableShape(fusionTable, keyColumn, keyValue)] = sceneAreas
        return sceneAreas
    }
}
