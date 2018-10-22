package org.openforis.sepal.component.datasearch.api

import groovy.transform.Canonical

@Canonical
class AutomaticSceneSelectingMapQuery {
    String source
    Date fromDate
    Date toDate
    List<String> sensors
    Aoi aoi
    int targetDayOfYear
    double targetDayOfYearWeight
    double shadowTolerance
    boolean medianComposite
    boolean brdfCorrect
    boolean maskWater
    boolean maskSnow
    List<String> bands
}
