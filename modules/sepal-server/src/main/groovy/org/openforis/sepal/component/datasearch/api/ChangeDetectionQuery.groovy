package org.openforis.sepal.component.datasearch.api

import groovy.transform.Canonical

@Canonical
class ChangeDetectionQuery {
    String tableName
    String classProperty
    String fromImageRecipeId
    String toImageRecipeId
    String fromAssetId
    String toAssetId
    String algorithm
}
