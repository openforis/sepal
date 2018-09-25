package org.openforis.sepal.component.datasearch.api


import org.openforis.sepal.util.DateTime
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SceneQuery {
    String sceneAreaId
    String source
    Collection<String> dataSets
    int targetDayOfYear
    double targetDayOfYearWeight
    Date fromDate
    Date toDate

    int getSeasonStartDayOfYear() {
        DateTime.dayOfYearIgnoringLeapDay(fromDate)
    }

    int getSeasonEndDayOfYear() {
        DateTime.dayOfYearIgnoringLeapDay(toDate)
    }
}
