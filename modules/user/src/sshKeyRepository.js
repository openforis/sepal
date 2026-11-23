import {isUniqueViolation} from '#sepal/db/postgres'
import {storedUsername} from '#sepal/username'

import {toISOString} from './user.js'
import {isText} from './validation.js'

// `username` is citext, as in sepal_user, so every lookup matches the stored spelling in any case.
export class SshKeyRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    async list(username) {
        if (!isText(username)) {
            return []
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query('SELECT * FROM ssh_key WHERE username = $1 ORDER BY id', [username])
            return rows.map(rowToKey)
        })
    }

    async count(username) {
        requireUsername(username)
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query('SELECT COUNT(*) AS count FROM ssh_key WHERE username = $1', [username])
            return rows[0].count
        })
    }

    // The unique index decides a duplicate, so two concurrent adds of one key cannot both succeed.
    async add(username, {name, type, publicKey, fingerprint}) {
        requireUsername(username)
        return this.#db.withConnection(async connection => {
            try {
                const {rows} = await connection.query(
                    `INSERT INTO ssh_key (username, name, key_type, public_key, fingerprint)
                     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                    [storedUsername(username), name, type, publicKey, fingerprint]
                )
                return rowToKey(rows[0])
            } catch (error) {
                if (isUniqueViolation(error)) {
                    return null
                }
                throw error
            }
        })
    }

    async remove(username, id) {
        requireUsername(username)
        return this.#db.withConnection(async connection => {
            const {rowCount} = await connection.query('DELETE FROM ssh_key WHERE username = $1 AND id = $2', [username, id])
            return rowCount === 1
        })
    }
}

const rowToKey = row => ({
    id: row.id,
    name: row.name,
    type: row.key_type,
    publicKey: row.public_key,
    fingerprint: row.fingerprint,
    creationTime: toISOString(row.creation_time)
})

const requireUsername = username => {
    if (!isText(username)) {
        throw new Error('Invalid username')
    }
}
