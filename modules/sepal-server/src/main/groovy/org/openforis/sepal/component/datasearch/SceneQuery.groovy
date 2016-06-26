package org.openforis.sepal.component.datasearch

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SceneQuery {
    String sceneAreaId
    Date fromDate
    Date toDate
    String targetDay
}
