package org.openforis.sepal.component.datasearch

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SceneMetaData {
    String id
    DataSet dataSet
    String sceneAreaId
    String sensorId
    Date acquisitionDate
    double cloudCover // In percentage
    double sunAzimuth
    double sunElevation
    URI browseUrl
    Date updateTime
}
