package org.openforis.sepal.scene.management

import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionProvider

class DataSetRepository {
    private final SqlConnectionProvider connectionProvider

    DataSetRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    boolean containsDataSetWithId(int id) {
        def row = sql.firstRow('SELECT * FROM data_set WHERE id = ? AND dataset_active = 1', [id])
        return row != null
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
