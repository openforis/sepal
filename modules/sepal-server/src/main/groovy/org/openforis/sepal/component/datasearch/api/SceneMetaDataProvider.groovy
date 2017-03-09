package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.component.datasearch.api.SceneQuery

interface SceneMetaDataProvider {
    List<SceneMetaData> findScenesInSceneArea(SceneQuery query)

    void eachScene(SceneQuery query, double targetDayOfYearWeight, Closure<Boolean> callback)
}