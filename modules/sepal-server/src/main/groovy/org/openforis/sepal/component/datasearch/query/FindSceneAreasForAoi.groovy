package org.openforis.sepal.component.datasearch.query

import org.openforis.sepal.component.datasearch.api.DataSet
import org.openforis.sepal.component.datasearch.api.SceneArea
import org.openforis.sepal.component.datasearch.api.Aoi
import org.openforis.sepal.component.datasearch.api.GoogleEarthEngineGateway
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

@Data
class FindSceneAreasForAoi implements Query<List<SceneArea>> {
    DataSet dataSet
    Aoi aoi
}

class FindSceneAreasForAoiHandler implements QueryHandler<List<SceneArea>, FindSceneAreasForAoi> {
    private final GoogleEarthEngineGateway sceneAreaProvider

    FindSceneAreasForAoiHandler(GoogleEarthEngineGateway sceneAreaProvider) {
        this.sceneAreaProvider = sceneAreaProvider
    }

    List<SceneArea> execute(FindSceneAreasForAoi query) {
        return sceneAreaProvider.findSceneAreasInAoi(query.dataSet, query.aoi)
    }
}
