// params and status_description are LONGTEXT read as strings: params is a JSON string, and
// status_description is the raw i18n JSON string.

import {storedUsername} from '#sepal/username'

import {createTask, State, StateDescription, Timeout} from './task.js'

const {PENDING, ACTIVE, CANCELING} = State

// The column projection shared by every SELECT — note it does NOT select `removed`.
const SELECT_COLUMNS =
    'id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time'

export class TaskRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    insert(task) {
        return this.#db.withConnection(async connection => {
            const taskParams = JSON.stringify(task.params)
            await connection.query(
                `INSERT INTO task(id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time, removed)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
                [
                    task.id, task.state, task.recipeId, storedUsername(task.username), task.sessionId,
                    task.operation, taskParams,
                    task.statusDescription ?? StateDescription[task.state], task.creationTime, task.updateTime,
                ]
            )
        })
    }

    update(task) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE task
                    SET state = ?, status_description = ?, update_time = ?
                    WHERE id = ?`,
                [task.state, task.statusDescription, this.#clock(), task.id]
            )
        })
    }

    remove(task) {
        return this.#db.withConnection(async connection => {
            await connection.query('UPDATE task SET removed = TRUE WHERE id = ?', [task.id])
        })
    }

    removeNonPendingOrActiveUserTasks(username) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE task
                    SET removed = TRUE
                    WHERE username = ?
                    AND state NOT IN (?, ?)`,
                [username, PENDING, ACTIVE]
            )
        })
    }

    getTask(taskId) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT ${SELECT_COLUMNS}
                    FROM task
                    WHERE id = ?`,
                [taskId]
            )
            const row = rows[0]
            if (!row) {
                throw new Error(`Non-existing task: ${taskId}`)
            }
            return toTask(row)
        })
    }

    // A task is timed out if it is
    //   PENDING   and update_time < now − 10min, OR
    //   ACTIVE    and update_time < now − 5min,  OR
    //   CANCELING and update_time < now − 2min.
    timedOutTasks() {
        return this.#db.withConnection(async connection => {
            const now = this.#clock()
            const [rows] = await connection.query(
                `SELECT ${SELECT_COLUMNS}
                    FROM task
                    WHERE (state = ? AND update_time < ?)
                    OR (state = ? AND update_time < ?)
                    OR (state = ? AND update_time < ?)`,
                [
                    PENDING, Timeout.PENDING.lastValidUpdate(now),
                    ACTIVE, Timeout.ACTIVE.lastValidUpdate(now),
                    CANCELING, Timeout.CANCELING.lastValidUpdate(now),
                ]
            )
            return rows.map(toTask)
        })
    }

    pendingOrActiveTasksInSession(sessionId) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT ${SELECT_COLUMNS}
                    FROM task
                    WHERE session_id = ?
                    AND state IN (?, ?)`,
                [sessionId, PENDING, ACTIVE]
            )
            return rows.map(toTask)
        })
    }

    userTasks(username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT ${SELECT_COLUMNS}
                    FROM task
                    WHERE username = ?
                    AND REMOVED = FALSE
                    ORDER BY creation_time`,
                [username]
            )
            return rows.map(toTask)
        })
    }

    pendingOrActiveUserTasks(username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT ${SELECT_COLUMNS}
                    FROM task
                    WHERE username = ?
                    AND state IN (?, ?)`,
                [username, PENDING, ACTIVE]
            )
            return rows.map(toTask)
        })
    }
}

// params is parsed from its JSON string; status_description falls back to the state's default
// description; recipe_id may be null.
const toTask = row => createTask({
    id: row.id,
    state: row.state,
    recipeId: row.recipe_id,
    username: row.username,
    operation: row.operation,
    params: JSON.parse(row.params),
    sessionId: row.session_id,
    statusDescription: row.status_description || StateDescription[row.state],
    creationTime: row.creation_time ? new Date(row.creation_time) : null,
    updateTime: row.update_time ? new Date(row.update_time) : null,
})
