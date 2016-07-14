package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class PreselectedScenesMapQuery {
    List<String> sceneIds
    Aoi aoi
    int targetDayOfYear
    double atargetDayOfYearWeight
    List<String> bands
}
