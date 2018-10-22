package org.openforis.sepal.component.datasearch.api

import groovy.transform.Canonical

@Canonical
class ClassificationQuery {
    String tableName
    String classProperty
    String imageRecipeId
    String assetId
    String algorithm
}
