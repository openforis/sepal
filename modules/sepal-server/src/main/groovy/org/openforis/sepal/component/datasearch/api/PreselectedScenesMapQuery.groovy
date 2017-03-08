package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.Data

@Data
class PreselectedScenesMapQuery {
    DataSet dataSet
    List<String> sceneIds
    Aoi aoi
    int targetDayOfYear
    double targetDayOfYearWeight
    List<String> bands
}
