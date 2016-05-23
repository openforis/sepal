package org.openforis.sepal.component.task

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionManager

interface TaskRepository {
    List<TaskStatus> userTasks(String username)

    void insert(TaskStatus status)
}

class JdbcTaskRepository implements TaskRepository {
    private final SqlConnectionManager connectionManager

    JdbcTaskRepository(SqlConnectionManager connectionManager) {
        this.connectionManager = connectionManager
    }

    List<TaskStatus> userTasks(String username) {
        sql.rows('''
                SELECT id, username, state, operation, data
                FROM task
                WHERE username = ?
                ORDER BY id
        ''', [username]).collect {
            new TaskStatus(
                    id: it.id,
                    username: it.username,
                    state: it.state as State,
                    task: new Task(
                            operation: it.operation,
                            data: new JsonSlurper().parseText(it.data) as Map
                    )
            )
        }
    }

    void insert(TaskStatus status) {
        def data = JsonOutput.toJson(status.task.data)
        sql.executeInsert('''
                INSERT INTO task (username, state, operation, data)
                VALUES(?, ?, ?, ?)''', [
                status.username, status.state.name(), status.task.operation, data
        ])
    }

    private Sql getSql() {
        new Sql(connectionManager.dataSource)
    }
}