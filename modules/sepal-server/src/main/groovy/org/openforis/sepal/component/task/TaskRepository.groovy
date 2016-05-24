package org.openforis.sepal.component.task

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionManager

import static org.openforis.sepal.component.task.State.*

interface TaskRepository {
    List<Task> userTasks(String username)

    Task insert(Task task)

    Task updateStateAndReturnIt(long taskId, State state)

    void updateStateForInstance(String instanceId, State state)

    void eachPendingTask(List<Instance> instances, Closure taskCallback)

    List<Instance> unusedInstances(List<Instance> instances)
}

class JdbcTaskRepository implements TaskRepository {
    private final SqlConnectionManager connectionManager

    JdbcTaskRepository(SqlConnectionManager connectionManager) {
        this.connectionManager = connectionManager
    }

    List<Task> userTasks(String username) {
        sql.rows('''
                SELECT id, username, state, instance_id, operation, data
                FROM task
                WHERE username = ?
                ORDER BY id
        ''', [username]).collect { toTask(it) }
    }

    Task insert(Task task) {
        def data = JsonOutput.toJson(task.operation.data)
        def result = sql.executeInsert('''
                INSERT INTO task (username, state, instance_id, operation, data)
                VALUES(?, ?, ?, ?, ?)''', [
                task.username, task.state.name(), task.instanceId, task.operation.name, data
        ])
        def id = result[0][0] as long
        return task.withId(id)
    }

    Task updateStateAndReturnIt(long taskId, State state) {
        updateState(taskId, state)
        def row = sql.firstRow('''
                SELECT id, username, state, instance_id, operation, data
                FROM task
                WHERE id = ?''', [taskId])
        if (!row)
            throw new IllegalStateException("Unable to find task with id $taskId")
        return toTask(row)
    }

    void updateStateForInstance(String instanceId, State state) {
        sql.executeUpdate('UPDATE task SET state = ? WHERE instance_id = ?', [state.name(), instanceId])
    }

    void eachPendingTask(List<Instance> instances, Closure callback) {
        def instanceById = instances.collectEntries {
            [(it.id): it]
        }
        def query = """
                SELECT  id, username, state, instance_id, operation, data
                FROM task
                WHERE instance_id in (${placeholders(instanceById.size())})
                AND state IN (?, ?)""" as String
        def params = [instanceById.keySet(), INSTANCE_STARTING.name(), PROVISIONING.name()].flatten() as List<Object>
        sql.rows(query, params).each {
            def task = toTask(it)
            def instance = instanceById[task.instanceId]
            callback(task, instance)
            updateState(task.id, ACTIVE)
        }
    }

    List<Instance> unusedInstances(List<Instance> instances) {
        def instanceIds = instances.collect { it.id }
        def query = """
                SELECT DISTINCT instance_id
                FROM task
                WHERE instance_id in (${placeholders(instances.size())})
                AND state in (?, ?, ?)""" as String
        def params = [instanceIds, INSTANCE_STARTING.name(), PROVISIONING.name(), ACTIVE.name()].flatten() as List<Object>
        def usedInstanceIds = sql.rows(query, params).collect { it.instance_id }.toSet()
        return instances.findAll { !usedInstanceIds.contains(it.id) }
    }

    private String placeholders(int count) {
        (['?'] * count).join(', ')
    }

    private void updateState(long taskId, State state) {
        def updated = sql.executeUpdate('UPDATE task SET state = ? WHERE id = ?', [state.name(), taskId])
        if (!updated)
            throw new IllegalStateException("Unable to find task with id $taskId")
    }

    private Task toTask(GroovyRowResult row) {
        new Task(
                id: row.id,
                username: row.username,
                state: row.state as State,
                instanceId: row.instance_id,
                operation: new Operation(
                        name: row.operation,
                        data: new JsonSlurper().parseText(row.data) as Map
                )
        )
    }


    private Sql getSql() {
        new Sql(connectionManager.dataSource)
    }
}