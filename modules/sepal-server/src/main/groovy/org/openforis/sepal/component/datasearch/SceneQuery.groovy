package org.openforis.sepal.component.datasearch

import groovy.transform.Immutable

@Immutable
class SceneQuery {
    String sceneAreaId
    Date fromDate
    Date toDate
    String targetDay
}
