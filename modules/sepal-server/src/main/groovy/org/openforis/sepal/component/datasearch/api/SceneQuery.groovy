package org.openforis.sepal.component.datasearch.api

import groovy.transform.Immutable
import org.openforis.sepal.util.DateTime

@Immutable
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
