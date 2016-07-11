package org.openforis.sepal.component.datasearch.query

import groovy.transform.Immutable
import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.component.datasearch.SceneMetaDataProvider
import org.openforis.sepal.component.datasearch.api.SceneQuery
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class FindScenesForSceneArea implements Query<List<SceneMetaData>> {
    SceneQuery sceneQuery
}

class FindScenesForSceneAreaHandler implements QueryHandler<List<SceneMetaData>, FindScenesForSceneArea> {
    private final SceneMetaDataProvider sceneMetaDataProvider

    FindScenesForSceneAreaHandler(SceneMetaDataProvider sceneMetaDataProvider) {
        this.sceneMetaDataProvider = sceneMetaDataProvider
    }

    List<SceneMetaData> execute(FindScenesForSceneArea query) {
        return sceneMetaDataProvider.findScenesInSceneArea(query.sceneQuery)
    }
}
