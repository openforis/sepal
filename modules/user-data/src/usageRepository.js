import {storedUsername} from '#sepal/username'

export class UsageRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    markDirty(username) {
        return this.#db.withConnection(connection => connection.query(
            `INSERT INTO data_usage (username, dirty_since) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE dirty_since = IFNULL(dirty_since, VALUES(dirty_since))`,
            [storedUsername(username), this.#clock()]
        ))
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

    recordMeasurement(username, size) {
        return this.#db.withConnection(connection => connection.query(
            `INSERT INTO data_usage (username, size, measured_at, dirty_since) VALUES (?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE size = VALUES(size), measured_at = VALUES(measured_at), dirty_since = NULL`,
            [storedUsername(username), size, this.#clock()]
        ))
    }

    requestErase(username) {
        return this.#db.withConnection(connection => connection.query(
            `INSERT INTO data_usage (username, erase_requested_at) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE erase_requested_at = IFNULL(erase_requested_at, VALUES(erase_requested_at))`,
            [storedUsername(username), this.#clock()]
        ))
    }

    async eraseRequests() {
        const [rows] = await this.#db.withConnection(connection => connection.query(
            'SELECT username FROM data_usage WHERE erase_requested_at IS NOT NULL ORDER BY erase_requested_at, username'
        ))
        return rows.map(({username}) => username)
    }

    clearEraseRequest(username) {
        return this.#db.withConnection(connection => connection.query(
            'UPDATE data_usage SET erase_requested_at = NULL WHERE username = ?',
            [storedUsername(username)]
        ))
    }
}
