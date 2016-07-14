package org.openforis.sepal.component.datasearch.query

import groovy.transform.Immutable
import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.component.datasearch.api.FusionTableAoi
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class FindSceneAreasForAoi implements Query<List<SceneArea>> {
    FusionTableAoi aoi
}

class FindSceneAreasForAoiHandler implements QueryHandler<List<SceneArea>, FindSceneAreasForAoi> {
    private final GoogleEarthEngineGateway sceneAreaProvider

    FindSceneAreasForAoiHandler(GoogleEarthEngineGateway sceneAreaProvider) {
        this.sceneAreaProvider = sceneAreaProvider
    }

    List<SceneArea> execute(FindSceneAreasForAoi query) {
        return sceneAreaProvider.findSceneAreasInAoi(query.aoi)
    }
}
