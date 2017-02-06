package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.component.datasearch.DataSet
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SceneQuery {
    DataSet dataSet
    String sceneAreaId
    List<String> sensorIds
    Date fromDate
    Date toDate
    int targetDayOfYear
}
