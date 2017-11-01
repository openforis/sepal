package org.openforis.sepal.component.workerinstance.adapter

import groovy.sql.Sql
import org.openforis.sepal.component.workerinstance.api.InstanceRepository
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.sql.SqlConnectionProvider

class JdbcInstanceRepository implements InstanceRepository {
    private final SqlConnectionProvider connectionProvider

    JdbcInstanceRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    void launched(Collection<WorkerInstance> instances) {
        instances.each { instance ->
            sql.executeInsert('INSERT INTO instance(id, type, worker_type) VALUES(?, ?, ?)',
                    [instance.id, instance.type, instance.reservation?.workerType])
        }
    }

    boolean reserved(String id, String workerType) {
        sql.executeUpdate('UPDATE instance SET worker_type = ? WHERE id = ? AND worker_type IS NULL',
                [workerType, id]) > 0
    }

    boolean released(String id) {
        sql.executeUpdate('UPDATE instance SET worker_type = NULL WHERE id = ?',
                [id]) > 0
    }

    void terminated(String id) {
        sql.executeUpdate('DELETE FROM instance WHERE id = ?',
                [id])
    }

    List<String> idleInstances(String instanceType) {
        sql.rows('SELECT id FROM instance WHERE type = ? AND worker_type IS NULL', [instanceType])
                .collect { it.id }
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
