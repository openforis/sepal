package org.openforis.sepal.component.task

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionManager

interface TaskRepository {
    List<TaskStatus> userTasks(String username)

    TaskStatus insert(TaskStatus status)

    TaskStatus updateState(long taskId, State state)
}

class JdbcTaskRepository implements TaskRepository {
    private final SqlConnectionManager connectionManager

    JdbcTaskRepository(SqlConnectionManager connectionManager) {
        this.connectionManager = connectionManager
    }

    List<TaskStatus> userTasks(String username) {
        sql.rows('''
                SELECT id, username, state, instance_id, operation, data
                FROM task
                WHERE username = ?
                ORDER BY id
        ''', [username]).collect { toTaskStatus(it) }
    }

    TaskStatus insert(TaskStatus status) {
        def data = JsonOutput.toJson(status.task.data)
        def result = sql.executeInsert('''
                INSERT INTO task (username, state, instance_id, operation, data)
                VALUES(?, ?, ?, ?, ?)''', [
                status.username, status.state.name(), status.instanceId, status.task.operation, data
        ])
        def id = result[0][0] as long
        return status.withId(id)
    }

    TaskStatus updateState(long taskId, State state) {
        sql.executeUpdate('UPDATE task SET state = ? WHERE id = ?', [state.name(), taskId])
        def row = sql.firstRow('''
                SELECT id, username, state, instance_id, operation, data
                FROM task
                WHERE id = ?''', [taskId])
        if (!row)
            throw new IllegalStateException("Unable to find task with id $taskId")
        return toTaskStatus(row)
    }

    private TaskStatus toTaskStatus(GroovyRowResult row) {
        new TaskStatus(
                id: row.id,
                username: row.username,
                state: row.state as State,
                instanceId: row.instance_id,
                task: new Task(
                        operation: row.operation,
                        data: new JsonSlurper().parseText(row.data) as Map
                )
        )
    }


    private Sql getSql() {
        new Sql(connectionManager.dataSource)
    }
}