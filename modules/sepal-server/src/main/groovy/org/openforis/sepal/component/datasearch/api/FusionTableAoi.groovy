package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class FusionTableAoi {
    String tableName
    String keyColumn
    String keyValue
}
