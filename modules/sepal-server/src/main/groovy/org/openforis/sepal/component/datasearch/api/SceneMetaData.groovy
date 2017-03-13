package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SceneMetaData {
    String id
    DataSet dataSet
    String sceneAreaId
    String sensorId
    Date acquisitionDate
    double cloudCover // In percentage
    double coverage // In percentage
    double sunAzimuth
    double sunElevation
    double[][] footprint
    URI browseUrl
    Date updateTime
}
