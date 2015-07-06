package org.openforis.sepal.repository

import groovy.sql.Sql
import org.openforis.sepal.model.DataSet
import org.openforis.sepal.transaction.SqlConnectionProvider

class DataSetRepository {
    private final SqlConnectionProvider connectionProvider

    DataSetRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    DataSet getDataSetById(int id) {
        def dataSet = findById(id)
        if (dataSet == null)
            throw new IllegalStateException("No data set with ID $id exists")
        return dataSet
    }

    boolean containsDataSetWithId(int id) {
        findById(id) != null
    }

    private DataSet findById(int dataSetId) {
        def row = sql.firstRow('SELECT * FROM data_set WHERE id = ? AND dataset_active = 1', [dataSetId])
        if (row == null)
            return null
        new DataSet(
                dataSetActive: row.dataset_active,
                dataSetId: row.id,
                dataSetName: row.dataset_name,
                dataSetValue: row.dataset_value
        )
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
