package org.openforis.sepal.component.datasearch.api

import groovy.json.JsonOutput
import org.openforis.sepal.util.annotation.ImmutableData

interface Aoi {
    Map getParams()
}

@ImmutableData
class FusionTableShape implements Aoi {
    String tableName
    String keyColumn
    String keyValue

    Map<String, String> getParams() {
        [
                fusionTable: tableName,
                keyColumn: keyColumn,
                keyValue : keyValue
        ]
    }
}

@ImmutableData
class Polygon implements Aoi {
    List<List<Double>> path

    Map<String, String> getParams() {
        [polygon: JsonOutput.toJson(path)]
    }
}
