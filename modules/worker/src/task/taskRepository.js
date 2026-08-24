// Task repository — persists task lifecycle to the `worker`.`task` table.
//
// createTaskRepository(pool?, clock?) — pool falls back to the module-level getPool() (shared
// worker pool); clock (default () => new Date()) drives update_time and the timedOutTasks "now",
// and is injectable so tests can pin time.
//
// Rows are reconstructed into Task domain objects. params / status_description are LONGTEXT read
// as strings (params stored as a JSON string; status_description as the raw i18n JSON string).

import {getPool} from '../db.js'
import {createTask, State, StateDescription, Timeout} from './task.js'

const {PENDING, ACTIVE, CANCELING} = State

// The column projection shared by every SELECT — note it does NOT select `removed`.
const SELECT_COLUMNS =
    'id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time'

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

const createTaskRepository = (pool = null, clock = () => new Date()) => {
    const resolvePool = () => pool ?? getPool()

    const insert = async task => {
        const p = resolvePool()
        const taskParams = JSON.stringify(task.params)
        await p.query(
            `INSERT INTO task(id, state, recipe_id, username, session_id, operation, params, status_description, creation_time, update_time, removed)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
            [
                task.id, task.state, task.recipeId, task.username, task.sessionId, task.operation, taskParams,
                task.statusDescription ?? StateDescription[task.state], task.creationTime, task.updateTime,
            ]
        )
    }

    const update = async task => {
        const p = resolvePool()
        await p.query(
            `UPDATE task
                SET state = ?, status_description = ?, update_time = ?
                WHERE id = ?`,
            [task.state, task.statusDescription, clock(), task.id]
        )
    }

    const remove = async task => {
        const p = resolvePool()
        await p.query('UPDATE task SET removed = TRUE WHERE id = ?', [task.id])
    }

    const removeNonPendingOrActiveUserTasks = async username => {
        const p = resolvePool()
        await p.query(
            `UPDATE task
                SET removed = TRUE
                WHERE username = ?
                AND state NOT IN (?, ?)`,
            [username, PENDING, ACTIVE]
        )
    }

    // Throws if the row does not exist.
    const getTask = async taskId => {
        const p = resolvePool()
        const [rows] = await p.query(
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
    }

    // A task is timed out if it is
    //   PENDING   and update_time < now − 10min, OR
    //   ACTIVE    and update_time < now − 5min,  OR
    //   CANCELING and update_time < now − 2min.
    const timedOutTasks = async () => {
        const p = resolvePool()
        const now = clock()
        const [rows] = await p.query(
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
    }

    const pendingOrActiveTasksInSession = async sessionId => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT ${SELECT_COLUMNS}
                FROM task
                WHERE session_id = ?
                AND state IN (?, ?)`,
            [sessionId, PENDING, ACTIVE]
        )
        return rows.map(toTask)
    }

    const userTasks = async username => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT ${SELECT_COLUMNS}
                FROM task
                WHERE username = ?
                AND REMOVED = FALSE
                ORDER BY creation_time`,
            [username]
        )
        return rows.map(toTask)
    }

    const pendingOrActiveUserTasks = async username => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT ${SELECT_COLUMNS}
                FROM task
                WHERE username = ?
                AND state IN (?, ?)`,
            [username, PENDING, ACTIVE]
        )
        return rows.map(toTask)
    }

    return {
        getTask,
        insert,
        pendingOrActiveTasksInSession,
        pendingOrActiveUserTasks,
        remove,
        removeNonPendingOrActiveUserTasks,
        timedOutTasks,
        update,
        userTasks,
    }
}

export {createTaskRepository}
