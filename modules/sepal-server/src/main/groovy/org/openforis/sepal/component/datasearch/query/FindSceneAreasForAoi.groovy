package org.openforis.sepal.component.datasearch.query

import groovy.transform.Immutable
import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.SceneAreaProvider
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class FindSceneAreasForAoi implements Query<List<SceneArea>> {
    String aoiId
}

class FindSceneAreasForAoiHandler implements QueryHandler<List<SceneArea>, FindSceneAreasForAoi> {
    private final SceneAreaProvider sceneAreaProvider

    FindSceneAreasForAoiHandler(SceneAreaProvider sceneAreaProvider) {
        this.sceneAreaProvider = sceneAreaProvider
    }

    List<SceneArea> execute(FindSceneAreasForAoi query) {
        return sceneAreaProvider.findSceneAreasInAoi(query.aoiId)
    }
}
