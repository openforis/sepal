package org.openforis.sepal.component.task

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionManager

import static org.openforis.sepal.component.task.State.*

interface TaskRepository {
    List<TaskStatus> userTasks(String username)

    TaskStatus insert(TaskStatus status)

    TaskStatus updateStateAndReturnIt(long taskId, State state)

    void updateStateForInstance(String instanceId, State state)

    boolean isInstanceIdle(String instanceId)

    List<TaskStatus> instanceActive(String instanceId)
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

    TaskStatus updateStateAndReturnIt(long taskId, State state) {
        updateState(taskId, state)
        def row = sql.firstRow('''
                SELECT id, username, state, instance_id, operation, data
                FROM task
                WHERE id = ?''', [taskId])
        if (!row)
            throw new IllegalStateException("Unable to find task with id $taskId")
        return toTaskStatus(row)
    }

    void updateStateForInstance(String instanceId, State state) {
        sql.executeUpdate('UPDATE task SET state = ? WHERE instance_id = ?', [state.name(), instanceId])
    }

    boolean isInstanceIdle(String instanceId) {
        def count = sql.firstRow('''
                SELECT count(*) count
                FROM task
                WHERE instance_id = ?
                AND state IN (?, ?, ?)''', [instanceId, INSTANCE_STARTING.name(), PROVISIONING.name(), ACTIVE.name()]).count
        return count == 0
    }

    List<TaskStatus> instanceActive(String instanceId) {
        sql.rows('''
                    SELECT id, username, state, instance_id, operation, data
                    FROM task
                    WHERE instance_id = ?
                    AND state = ?
                    ''', [instanceId, PROVISIONING.name()]).collect {
            def status = toTaskStatus(it)
            updateState(status.id, ACTIVE)
            status.toActive()
        }
    }


    private void updateState(long taskId, State state) {
        def updated = sql.executeUpdate('UPDATE task SET state = ? WHERE id = ?', [state.name(), taskId])
        if (!updated)
            throw new IllegalStateException("Unable to find task with id $taskId")
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