package datasearch

import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.component.datasearch.SceneMetaDataProvider
import org.openforis.sepal.component.datasearch.SceneQuery

class FakeSceneMetaDataProvider implements SceneMetaDataProvider {
    private final Map<SceneQuery, List<SceneMetaData>> scenesByQuery = [:]

    List<SceneMetaData> findScenesInSceneArea(SceneQuery query) {
        return scenesByQuery[query]
    }

    List<SceneMetaData> scenes(SceneQuery query, List<SceneMetaData> scenes) {
        scenesByQuery[query] = scenes
        return scenes
    }
}
