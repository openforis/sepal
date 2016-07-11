package datasearch

import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.SceneAreaProvider

class FakeSceneAreaProvider implements SceneAreaProvider {
    private final Map<String, Collection<SceneArea>> sceneAreasByFusionTable = [:]


    Collection<SceneArea> findSceneAreasInAoi(String fusionTable, String keyColumn, String keyValue) {
        return sceneAreasByFusionTable[key(fusionTable, keyColumn, keyValue)]
    }

    List<SceneArea> areas(String fusionTable, String keyColumn, String keyValue, List<SceneArea> sceneAreas) {
        sceneAreasByFusionTable[key(fusionTable, keyColumn, keyValue)] = sceneAreas
        return sceneAreas
    }

    private String key(String fusionTable, String keyColumn, String keyValue) {
        "$fusionTable|$keyColumn|$keyValue"
    }
}
