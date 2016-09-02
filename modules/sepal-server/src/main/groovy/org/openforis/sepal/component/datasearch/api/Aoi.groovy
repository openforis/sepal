package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.ImmutableData

interface Aoi {
    Map getParams()
}

@ImmutableData
class FusionTableShape implements Aoi {
    String tableName
    String keyColumn
    String keyValue

    Map getParams() {
        [
                type     : 'fusionTable',
                tableName: tableName,
                keyColumn: keyColumn,
                keyValue : keyValue
        ]
    }
}

@ImmutableData
class Polygon implements Aoi {
    List<List<Double>> path

    Map getParams() {
        [
                type: 'polygon',
                path: path
        ]
    }
}
