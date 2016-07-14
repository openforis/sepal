package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class AutomaticSceneSelectingMapQuery {
    Date fromDate
    Date toDate
    List<String> sensors
    FusionTableAoi aoi
    int targetDayOfYear
    double targetDayOfYearWeight
    List<String> bands
}
