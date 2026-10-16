import {storedUsername} from '#sepal/username'

import {createTask, RUNNING_STATES, State, StateDescription} from './task.js'

const COLUMNS = 'id, state, username, operation, params, status_description, recipe_id, creation_time, update_time, progress_time'

// Every write that changes a task is announced for its owner after it is stored; the task-list websocket
// re-reads the owner's tasks on each announcement.
export class TaskRepository {
    #db
    #clock
    #onChange

    constructor(db, {clock, onChange}) {
        this.#db = db
        this.#clock = clock
        this.#onChange = onChange
    }

    async insert(task) {
        await this.#query(
            `INSERT INTO task(id, state, username, operation, params, status_description, recipe_id, creation_time, update_time)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [task.id, task.state, storedUsername(task.username), task.operation, JSON.stringify(task.params),
                task.statusDescription, task.recipeId, task.creationTime, task.updateTime]
        )
        this.#onChange(task.username)
    }

    async getTask(id) {
        const [row] = await this.#select(`SELECT ${COLUMNS} FROM task WHERE id = ?`, [id])
        return row ? toTask(row) : null
    }

    async userTasks(username) {
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE username = ? AND removed = FALSE ORDER BY creation_time`,
            [username]
        )
        return rows.map(toTask)
    }

    async pendingTasks(limit, {excludeUsernames = []} = {}) {
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE state = ?${excludeUsernames.length ? ' AND username NOT IN (?)' : ''}
                ORDER BY creation_time LIMIT ?`,
            [State.PENDING, ...(excludeUsernames.length ? [excludeUsernames] : []), limit]
        )
        return rows.map(toTask)
    }

    async runningTasks() {
        const rows = await this.#select(`SELECT ${COLUMNS} FROM task WHERE state IN (?)`, [RUNNING_STATES])
        return rows.map(toTask)
    }

    async countRunning() {
        const [{count}] = await this.#select('SELECT COUNT(*) AS count FROM task WHERE state IN (?)', [RUNNING_STATES])
        return Number(count)
    }

    async countRunningByUser() {
        const rows = await this.#select(
            'SELECT username, COUNT(*) AS count FROM task WHERE state IN (?) GROUP BY username',
            [RUNNING_STATES]
        )
        return new Map(rows.map(({username, count}) => [username, Number(count)]))
    }

    activate(task, apiKeyHash) {
        const now = this.#clock()
        return this.#change(task,
            `UPDATE task SET state = ?, status_description = ?, api_key_hash = ?, update_time = ?, progress_time = ?
                WHERE id = ? AND state = ?`,
            [State.ACTIVE, StateDescription.ACTIVE, apiKeyHash, now, now, task.id, State.PENDING]
        )
    }

    // Conditional on the state the caller saw, so a cancel and a container's own completion cannot overwrite
    // each other: whichever is stored first wins.
    transition(task, {from, to, statusDescription = StateDescription[to]}) {
        return this.#change(task,
            `UPDATE task SET state = ?, status_description = ?, update_time = ?,
                api_key_hash = IF(? IN (?), api_key_hash, NULL)
                WHERE id = ? AND state IN (?)`,
            [to, statusDescription, this.#clock(), to, RUNNING_STATES, task.id, from]
        )
    }

    recordProgress(task, statusDescription) {
        const now = this.#clock()
        return this.#change(task,
            'UPDATE task SET status_description = ?, update_time = ?, progress_time = ? WHERE id = ? AND state = ?',
            [statusDescription, now, now, task.id, State.ACTIVE]
        )
    }

    // A slot's grant time identifies the grant: a release naming an earlier grant leaves a later one alone.
    async grantSlot(task) {
        const slot = this.#clock()
        const [{affectedRows}] = await this.#query(
            'UPDATE task SET slot_time = ? WHERE id = ? AND state = ? AND slot_time IS NULL',
            [slot, task.id, State.ACTIVE]
        )
        return affectedRows ? slot : null
    }

    async renewSlot(task) {
        const slot = this.#clock()
        const [{affectedRows}] = await this.#query(
            'UPDATE task SET slot_time = ? WHERE id = ? AND state IN (?) AND slot_time IS NOT NULL',
            [slot, task.id, RUNNING_STATES]
        )
        return affectedRows ? slot : null
    }

    // Answers the grant it ended, or null. Without a slot, releases whatever grant the task holds.
    async releaseSlot(task, slot) {
        const grant = slot ?? await this.#slotTime(task)
        if (!grant) {
            return null
        }
        const [{affectedRows}] = await this.#query(
            'UPDATE task SET slot_time = NULL WHERE id = ? AND slot_time = ?',
            [task.id, grant]
        )
        return affectedRows ? grant : null
    }

    async #slotTime(task) {
        const [row] = await this.#select('SELECT slot_time FROM task WHERE id = ?', [task.id])
        return row?.slot_time ? new Date(row.slot_time) : null
    }

    async slotHolders() {
        const rows = await this.#select(
            'SELECT id, username FROM task WHERE slot_time IS NOT NULL AND state IN (?)',
            [RUNNING_STATES]
        )
        return rows.map(({id, username}) => ({id, username}))
    }

    // task-manager's own downtime must not count as a container falling silent, nor against a cancellation,
    // which is timed from update_time.
    async resetProgressClock() {
        const now = this.#clock()
        await this.#query('UPDATE task SET progress_time = ? WHERE state = ?', [now, State.ACTIVE])
        await this.#query('UPDATE task SET update_time = ? WHERE state = ?', [now, State.CANCELING])
    }

    async stalledTasks(before) {
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE state = ? AND progress_time < ?`,
            [State.ACTIVE, before]
        )
        return rows.map(toTask)
    }

    async cancelingSince(before) {
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE state = ? AND update_time < ?`,
            [State.CANCELING, before]
        )
        return rows.map(toTask)
    }

    async findByApiKeyHash(apiKeyHash) {
        const [row] = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE api_key_hash = ? AND state IN (?)`,
            [apiKeyHash, RUNNING_STATES]
        )
        return row ? toTask(row) : null
    }

    remove(task) {
        return this.#change(task, 'UPDATE task SET removed = TRUE WHERE id = ?', [task.id])
    }

    async removeFinishedUserTasks(username) {
        await this.#query(
            'UPDATE task SET removed = TRUE WHERE username = ? AND state IN (?)',
            [username, [State.COMPLETED, State.CANCELED, State.FAILED]]
        )
        this.#onChange(username)
    }

    async #change(task, sql, values) {
        const [{affectedRows}] = await this.#query(sql, values)
        if (affectedRows) {
            this.#onChange(task.username)
        }
        return affectedRows > 0
    }

    #select(sql, values) {
        return this.#query(sql, values).then(([rows]) => rows)
    }

    #query(sql, values) {
        return this.#db.withConnection(connection => connection.query(sql, values))
    }
}

const toTask = row => createTask({
    id: row.id,
    state: row.state,
    username: row.username,
    operation: row.operation,
    params: JSON.parse(row.params),
    statusDescription: row.status_description,
    recipeId: row.recipe_id,
    creationTime: row.creation_time && new Date(row.creation_time),
    updateTime: row.update_time && new Date(row.update_time),
    progressTime: row.progress_time && new Date(row.progress_time)
})
