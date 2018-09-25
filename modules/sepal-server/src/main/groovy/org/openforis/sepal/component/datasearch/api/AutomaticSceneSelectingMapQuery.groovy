package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.Data

@Data
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
