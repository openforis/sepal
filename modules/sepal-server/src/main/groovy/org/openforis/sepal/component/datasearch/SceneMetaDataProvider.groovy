package org.openforis.sepal.component.datasearch

import org.openforis.sepal.component.datasearch.api.SceneQuery

interface SceneMetaDataProvider {
    List<SceneMetaData> findScenesInSceneArea(SceneQuery query)

    void eachScene(SceneQuery query, double targetDayOfYearWeight, Closure<Boolean> callback)
}