package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.component.datasearch.DataSet
import org.openforis.sepal.util.annotation.Data

@Data
class AutomaticSceneSelectingMapQuery {
    DataSet dataSet
    Date fromDate
    Date toDate
    List<String> sensors
    Aoi aoi
    int targetDayOfYear
    double targetDayOfYearWeight
    List<String> bands
}
