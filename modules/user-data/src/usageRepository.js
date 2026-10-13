import {storedUsername} from '#sepal/username'

export class UsageRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    // dirty_since is the latest mark, so a measurement clears only the marks made before it started.
    markDirty(username) {
        return this.#db.withConnection(connection => connection.query(
            `INSERT INTO data_usage (username, dirty_since) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE dirty_since = VALUES(dirty_since)`,
            [storedUsername(username), this.#clock()]
        ))
    }

    async isKnown(username) {
        const [rows] = await this.#db.withConnection(connection => connection.query(
            'SELECT 1 FROM data_usage WHERE username = ?',
            [storedUsername(username)]
        ))
        return rows.length > 0
    }

    async dirtyUsernames() {
        const [rows] = await this.#db.withConnection(connection => connection.query(
            'SELECT username FROM data_usage WHERE dirty_since IS NOT NULL ORDER BY dirty_since'
        ))
        return rows.map(({username}) => username)
    }

    async knownUsernames() {
        const [rows] = await this.#db.withConnection(connection => connection.query(
            'SELECT username FROM data_usage ORDER BY username'
        ))
        return rows.map(({username}) => username)
    }

    async measurements() {
        const [rows] = await this.#db.withConnection(connection => connection.query(
            'SELECT username, size FROM data_usage WHERE size IS NOT NULL ORDER BY username'
        ))
        return rows.map(({username, size}) => ({username, size: Number(size)}))
    }

    // measuredFrom is when the measurement started: a user marked dirty since then stays dirty.
    recordMeasurement(username, size, measuredFrom) {
        return this.#db.withConnection(connection => connection.query(
            `INSERT INTO data_usage (username, size, measured_at, dirty_since) VALUES (?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE size = VALUES(size), measured_at = VALUES(measured_at),
                dirty_since = IF(dirty_since <= ?, NULL, dirty_since)`,
            [storedUsername(username), size, this.#clock(), measuredFrom]
        ))
    }

    // Resolves to the time of the pending request, which a repeated request keeps.
    requestErase(username) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `INSERT INTO data_usage (username, erase_requested_at) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE erase_requested_at = IFNULL(erase_requested_at, VALUES(erase_requested_at))`,
                [storedUsername(username), this.#clock()]
            )
            const [[{erase_requested_at}]] = await connection.query(
                'SELECT erase_requested_at FROM data_usage WHERE username = ?',
                [storedUsername(username)]
            )
            return erase_requested_at
        })
    }

    async eraseRequests() {
        const [rows] = await this.#db.withConnection(connection => connection.query(
            `SELECT username, erase_requested_at FROM data_usage WHERE erase_requested_at IS NOT NULL
             ORDER BY erase_requested_at, username`
        ))
        return rows.map(({username, erase_requested_at}) => ({username, requestedAt: erase_requested_at}))
    }

    clearEraseRequest(username) {
        return this.#db.withConnection(connection => connection.query(
            'UPDATE data_usage SET erase_requested_at = NULL WHERE username = ?',
            [storedUsername(username)]
        ))
    }
}
