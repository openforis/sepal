package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.DateTime
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SceneQuery {
    DataSet dataSet
    String sceneAreaId
    List<String> sensorIds
    Date fromDate
    Date toDate
    int targetDayOfYear

    int getSeasonStartDayOfYear() {
        DateTime.dayOfYearIgnoringLeapDay(fromDate)
    }

    int getSeasonEndDayOfYear() {
        DateTime.dayOfYearIgnoringLeapDay(toDate)
    }
}
