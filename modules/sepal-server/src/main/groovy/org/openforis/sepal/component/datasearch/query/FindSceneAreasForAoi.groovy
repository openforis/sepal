package org.openforis.sepal.component.datasearch.query

import groovy.transform.Canonical
import org.openforis.sepal.component.datasearch.api.Aoi
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.api.SceneArea
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.User

@Canonical
class FindSceneAreasForAoi implements Query<List<SceneArea>> {
    User user
    String source
    Aoi aoi
}

class FindSceneAreasForAoiHandler implements QueryHandler<List<SceneArea>, FindSceneAreasForAoi> {
    private final GoogleEarthEngineGateway sceneAreaProvider

    FindSceneAreasForAoiHandler(GoogleEarthEngineGateway sceneAreaProvider) {
        this.sceneAreaProvider = sceneAreaProvider
    }

    List<SceneArea> execute(FindSceneAreasForAoi query) {
        return sceneAreaProvider.findSceneAreasInAoi(query.source, query.aoi, query.user)
    }
}
