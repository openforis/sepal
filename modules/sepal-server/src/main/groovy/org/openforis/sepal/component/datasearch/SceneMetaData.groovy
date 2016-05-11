package org.openforis.sepal.component.datasearch

import groovy.transform.Immutable

@Immutable
class SceneMetaData {
    String id
    MetaDataSource source
    String sceneAreaId
    String sensorId
    Date acquisitionDate
    double cloudCover
    double sunAzimuth
    double sunElevation
    URI browseUrl
    Date updateTime
}
