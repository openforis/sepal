package org.openforis.sepal.component.task.adapter

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.sql.Sql
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.Timeout
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.slf4j.LoggerFactory

import java.sql.Clob

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING

class JdbcTaskRepository implements TaskRepository {
    private static final LOG = LoggerFactory.getLogger(this)
    private final SqlConnectionManager connectionManager
    private final Clock clock

    JdbcTaskRepository(SqlConnectionManager connectionManager, Clock clock) {
        this.connectionManager = connectionManager
        this.clock = clock
    }

    void insert(Task task) {
        def taskParams = JsonOutput.toJson(task.params)
        sql.executeInsert('''
                INSERT INTO task(id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time, removed)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)''', [
            task.id, task.state.name(), task.recipeId, task.username, task.sessionId, task.operation, taskParams,
            task.statusDescription ?: task.state.description, task.creationTime, task.updateTime
        ])
        LOG.debug("Inserted $task")
    }

    void update(Task task) {
        sql.executeUpdate('''
                UPDATE task
                SET state = ?, status_description = ?, update_time = ?
                WHERE id = ?''', [task.state.name(), task.statusDescription, clock.now(), task.id])
        LOG.debug("Updated $task")
    }

    void remove(Task task) {
        LOG.debug("remove $task")
        sql.executeUpdate('UPDATE task SET removed = TRUE WHERE id = ?', [task.id])
    }

    void removeNonPendingOrActiveUserTasks(String username) {
        def removed = sql.executeUpdate('''
                UPDATE task
                SET removed = TRUE
                WHERE username = ?
                AND state NOT IN (?, ?)''', [username, PENDING.name(), ACTIVE.name()])
        LOG.debug("Removed $removed non-pending or active tasks for $username")
    }

    Task getTask(String taskId) {
        Task task = null
        sql.eachRow('''
                SELECT id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time
                FROM task
                WHERE id = ?''', [taskId]) {
            task = toTask(it)
        }
        if (!task)
            throw new IllegalStateException("Non-existing task: $taskId")
        return task
    }

    List<Task> timedOutTasks() {
        def now = clock.now()
        def tasks = []
        sql.eachRow('''
                SELECT id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time
                FROM task
                WHERE (state = ? AND update_time < ?)
                OR (state = ? AND update_time < ?)
            ''', [
            PENDING.name(), Timeout.PENDING.lastValidUpdate(now),
            ACTIVE.name(), Timeout.ACTIVE.lastValidUpdate(now)
        ]) { tasks << toTask(it) }
        return tasks
    }

    List<Task> pendingOrActiveTasksInSession(String sessionId) {
        def tasks = []
        sql.eachRow('''
                SELECT id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time
                FROM task
                WHERE session_id = ?
                AND state IN (?, ?)''', [sessionId, PENDING.name(), ACTIVE.name()]) { tasks << toTask(it) }
        return tasks
    }

    List<Task> userTasks(String username) {
        def tasks = []
        sql.eachRow('''
                SELECT id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time
                FROM task
                WHERE username = ?
                AND REMOVED = FALSE
                ORDER BY creation_time''', [username]) { tasks << toTask(it) }
        return tasks
    }


    List<Task> pendingOrActiveUserTasks(String username) {
        def tasks = []
        sql.eachRow('''
                SELECT id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time
                FROM task
                WHERE username = ?
                AND state IN (?, ?)''', [username, PENDING.name(), ACTIVE.name()]) { tasks << toTask(it) }
        return tasks
    }

    private Task toTask(row) {
        def state = row.state as Task.State
        new Task(
            id: row.id,
            state: state,
            recipeId: row.recipe_id,
            username: row.username,
            operation: row.operation,
            params: new JsonSlurper().parseText(row.params instanceof Clob ? ((Clob) row.params).asciiStream.text : row.params) as Map,
            sessionId: row.session_id,
            statusDescription: row.status_description ?: state.description,
            creationTime: row.creation_time,
            updateTime: row.update_time
        )
    }

    private Sql getSql() {
        connectionManager.sql
    }
}
