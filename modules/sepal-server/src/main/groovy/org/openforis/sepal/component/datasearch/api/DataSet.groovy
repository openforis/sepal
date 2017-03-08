package org.openforis.sepal.component.datasearch.api

enum DataSet {
    LANDSAT('USGS'),
    SENTINEL2('SENTINEL2')

    public final metaDataSource

    DataSet(metaDataSource) {
        this.metaDataSource = metaDataSource
    }

    static DataSet fromMetaDataSource(String metaDataSource) {
        values().find { it.metaDataSource == metaDataSource }
    }
}
