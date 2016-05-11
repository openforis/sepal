package datasearch

import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.SceneAreaProvider

class FakeSceneAreaProvider implements SceneAreaProvider {
    private final Map<String, Collection<SceneArea>> sceneAreasByAoiId = [:]

    Collection<SceneArea> findSceneAreasInAoi(String aoiId) {
        return sceneAreasByAoiId[aoiId]
    }

    List<SceneArea> areas(String aoiId, List<SceneArea> sceneAreas) {
        sceneAreasByAoiId[aoiId] = sceneAreas
        return sceneAreas
    }
}
