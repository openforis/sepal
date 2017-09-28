package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.Data

@Data
class ChangeDetectionQuery {
    String tableName
    String classProperty
    String fromImageRecipeId
    String toImageRecipeId
    String algorithm
}
