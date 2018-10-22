package org.openforis.sepal.component.datasearch.api

import groovy.transform.Immutable

@Immutable
class SceneMetaData {
    String id
    String source
    String sceneAreaId
    String dataSet
    Date acquisitionDate
    double cloudCover // In percentage
    double coverage // In percentage
    double sunAzimuth
    double sunElevation
    double[][] footprint
    URI browseUrl
    Date updateTime
}
