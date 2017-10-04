package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.Data

@Data
class ClassificationQuery {
    String tableName
    String classProperty
    String imageRecipeId
    String assetId
    String algorithm
}
