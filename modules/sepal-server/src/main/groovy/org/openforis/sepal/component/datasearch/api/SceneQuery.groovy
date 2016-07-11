package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SceneQuery {
    String sceneAreaId
    List<String> sensorIds
    Date fromDate
    Date toDate
    String targetDay
}
