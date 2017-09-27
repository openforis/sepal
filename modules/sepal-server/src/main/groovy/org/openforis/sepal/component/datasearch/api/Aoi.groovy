package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.util.annotation.ImmutableData

interface Aoi {
    Map getParams()
}

@ImmutableData
class FusionTableShape implements Aoi {
    static final COUNTRY_FUSION_TABLE = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
    static final COUNTRY_CODE_FUSION_TABLE_COLUMN = 'ISO'

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
class AoiPolygon implements Aoi {
    List<List<Double>> path

    Map getParams() {
        [
                type: 'polygon',
                path: path
        ]
    }
}
