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
                VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [task.id, task.state, storedUsername(task.username), task.operation, JSON.stringify(task.params),
                task.statusDescription, task.recipeId, task.creationTime, task.updateTime]
        )
        this.#onChange(task.username)
    }

    async getTask(id) {
        const [row] = await this.#select(`SELECT ${COLUMNS} FROM task WHERE id = $1`, [id])
        return row ? toTask(row) : null
    }

    async userTasks(username) {
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE username = $1 AND removed = FALSE ORDER BY creation_time`,
            [username]
        )
        return rows.map(toTask)
    }

    async pendingTasks(limit, {excludeUsernames = []} = {}) {
        const excluding = excludeUsernames.length > 0
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE state = $1${excluding ? ' AND username <> ALL($2::citext[])' : ''}
                ORDER BY creation_time LIMIT $${excluding ? 3 : 2}`,
            [State.PENDING, ...(excluding ? [excludeUsernames] : []), limit]
        )
        return rows.map(toTask)
    }

    async runningTasks() {
        const rows = await this.#select(`SELECT ${COLUMNS} FROM task WHERE state = ANY($1::text[])`, [RUNNING_STATES])
        return rows.map(toTask)
    }

    async countRunning() {
        const [{count}] = await this.#select('SELECT COUNT(*) AS count FROM task WHERE state = ANY($1::text[])', [RUNNING_STATES])
        return Number(count)
    }

    async countRunningByUser() {
        const rows = await this.#select(
            'SELECT username, COUNT(*) AS count FROM task WHERE state = ANY($1::text[]) GROUP BY username',
            [RUNNING_STATES]
        )
        return new Map(rows.map(({username, count}) => [username, Number(count)]))
    }

    activate(task, apiKeyHash) {
        const now = this.#clock()
        return this.#change(task,
            `UPDATE task SET state = $1, status_description = $2, api_key_hash = $3, update_time = $4, progress_time = $5
                WHERE id = $6 AND state = $7`,
            [State.ACTIVE, StateDescription.ACTIVE, apiKeyHash, now, now, task.id, State.PENDING]
        )
    }

    // Conditional on the state the caller saw, so a cancel and a container's own completion cannot overwrite
    // each other: whichever is stored first wins.
    transition(task, {from, to, statusDescription = StateDescription[to]}) {
        return this.#change(task,
            `UPDATE task SET state = $1, status_description = $2, update_time = $3,
                api_key_hash = CASE WHEN $4::text = ANY($5::text[]) THEN api_key_hash ELSE NULL END
                WHERE id = $6 AND state = ANY($7::text[])`,
            [to, statusDescription, this.#clock(), to, RUNNING_STATES, task.id, from]
        )
    }

    recordProgress(task, statusDescription) {
        const now = this.#clock()
        return this.#change(task,
            'UPDATE task SET status_description = $1, update_time = $2, progress_time = $3 WHERE id = $4 AND state = $5',
            [statusDescription, now, now, task.id, State.ACTIVE]
        )
    }

    // A slot's grant time identifies the grant: a release naming an earlier grant leaves a later one alone.
    async grantSlot(task) {
        const slot = this.#clock()
        const {rowCount} = await this.#query(
            'UPDATE task SET slot_time = $1 WHERE id = $2 AND state = $3 AND slot_time IS NULL',
            [slot, task.id, State.ACTIVE]
        )
        return rowCount ? slot : null
    }

    async renewSlot(task) {
        const slot = this.#clock()
        const {rowCount} = await this.#query(
            'UPDATE task SET slot_time = $1 WHERE id = $2 AND state = ANY($3::text[]) AND slot_time IS NOT NULL',
            [slot, task.id, RUNNING_STATES]
        )
        return rowCount ? slot : null
    }

    // Answers the grant it ended, or null. Without a slot, releases whatever grant the task holds.
    async releaseSlot(task, slot) {
        const grant = slot ?? await this.#slotTime(task)
        if (!grant) {
            return null
        }
        const {rowCount} = await this.#query(
            'UPDATE task SET slot_time = NULL WHERE id = $1 AND slot_time = $2',
            [task.id, grant]
        )
        return rowCount ? grant : null
    }

    async #slotTime(task) {
        const [row] = await this.#select('SELECT slot_time FROM task WHERE id = $1', [task.id])
        return row?.slot_time ? new Date(row.slot_time) : null
    }

    async slotHolders() {
        const rows = await this.#select(
            'SELECT id, username FROM task WHERE slot_time IS NOT NULL AND state = ANY($1::text[])',
            [RUNNING_STATES]
        )
        return rows.map(({id, username}) => ({id, username}))
    }

    // task-manager's own downtime must not count as a container falling silent, nor against a cancellation,
    // which is timed from update_time.
    async resetProgressClock() {
        const now = this.#clock()
        await this.#query('UPDATE task SET progress_time = $1 WHERE state = $2', [now, State.ACTIVE])
        await this.#query('UPDATE task SET update_time = $1 WHERE state = $2', [now, State.CANCELING])
    }

    async stalledTasks(before) {
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE state = $1 AND progress_time < $2`,
            [State.ACTIVE, before]
        )
        return rows.map(toTask)
    }

    async cancelingSince(before) {
        const rows = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE state = $1 AND update_time < $2`,
            [State.CANCELING, before]
        )
        return rows.map(toTask)
    }

    async findByApiKeyHash(apiKeyHash) {
        const [row] = await this.#select(
            `SELECT ${COLUMNS} FROM task WHERE api_key_hash = $1 AND state = ANY($2::text[])`,
            [apiKeyHash, RUNNING_STATES]
        )
        return row ? toTask(row) : null
    }

    // Answers whether this call removed the task, so concurrent resubmits of it run it again only once.
    remove(task) {
        return this.#change(task, 'UPDATE task SET removed = TRUE WHERE id = $1 AND removed = FALSE', [task.id])
    }

    async removeFinishedUserTasks(username, taskIds) {
        if (!taskIds.length) {
            return
        }
        const {rowCount} = await this.#query(
            'UPDATE task SET removed = TRUE WHERE username = $1 AND id = ANY($2::text[]) AND state = ANY($3::text[])',
            [username, taskIds, [State.COMPLETED, State.CANCELED, State.FAILED]]
        )
        if (rowCount) {
            this.#onChange(username)
        }
    }

    async #change(task, sql, values) {
        const {rowCount} = await this.#query(sql, values)
        if (rowCount) {
            this.#onChange(task.username)
        }
        return rowCount > 0
    }

    #select(sql, values) {
        return this.#query(sql, values).then(({rows}) => rows)
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
    params: row.params,
    statusDescription: row.status_description,
    recipeId: row.recipe_id,
    creationTime: row.creation_time && new Date(row.creation_time),
    updateTime: row.update_time && new Date(row.update_time),
    progressTime: row.progress_time && new Date(row.progress_time)
})
