import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

const log = getLogger('database')

const LOCK_TIMEOUT = '5s'

// `addEvent` holds a transaction-scoped advisory lock per user, so the check against the latest event and
// the insert cannot interleave with another writer for the same user. The other operations are single
// statements.
export class HistoryRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    addEvent({username, event}) {
        log.debug(`Adding event to ${username}: ${event}`)
        return this.#db.withTransaction(async connection => {
            await connection.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`)
            await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`user_history_${storedUsername(username)}`])
            // Stamped after the lock wait, not at the transaction's start. Events within one second share a
            // timestamp, so the id decides which is the latest.
            const {rowCount} = await connection.query(`
                INSERT INTO history
                (username, event, timestamp)
                SELECT $1::text, $2::text, statement_timestamp()
                WHERE COALESCE((
                    SELECT event
                    FROM history
                    WHERE username = $1
                    ORDER BY timestamp DESC, id DESC
                    LIMIT 1
                ), '') <> $2
            `, [storedUsername(username), event])
            return rowCount
        })
    }

    getMostRecentEvents() {
        log.debug('Getting most recent event for any user')
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(`
                SELECT t.id, t.username, t.event, t.timestamp
                FROM history t
                INNER JOIN (
                    SELECT username, MAX(id) AS max_id
                    FROM history
                    GROUP BY username
                ) AS sub
                ON t.username = sub.username AND t.id = sub.max_id
            `)
            return rows.reduce((acc, {username, event, timestamp}) => {
                acc[username] = {event, timestamp}
                return acc
            }, {})
        })
    }

    getUserEvents(username) {
        log.debug(`Getting events for user: ${username}`)
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(`
                SELECT event, timestamp
                FROM (
                    SELECT
                        event,
                        timestamp,
                        id,
                        LAG(event) OVER (ORDER BY timestamp DESC, id DESC) AS prev_event
                    FROM history
                    WHERE username = $1
                    AND event != 'INACTIVE_UNKNOWN'
                ) AS numbered_events
                WHERE prev_event IS DISTINCT FROM event
                ORDER BY timestamp DESC, id DESC
                LIMIT 10
            `, [username])
            return rows
        })
    }
}
