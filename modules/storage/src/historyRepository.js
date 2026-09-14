import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

const log = getLogger('database')

// Every operation is a single statement, so none of them needs a transaction. `addEvent` additionally holds
// a MySQL named lock, which is session-scoped: acquiring, writing and releasing all have to happen on the
// one connection `withConnection` scopes.
export class HistoryRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    addEvent({username, event}) {
        log.debug(`Adding event to ${username}: ${event}`)
        const lockName = `user_history_${username}`
        return this.#db.withConnection(async connection => {
            await connection.query('SELECT GET_LOCK(?, 5) AS got_lock', [lockName])
            const [results, _fields] = await connection.query(`
                INSERT INTO history
                (username, event, timestamp)
                SELECT ?, ?, NOW()
                WHERE COALESCE((
                    SELECT event
                    FROM history
                    WHERE username = ?
                    ORDER BY timestamp DESC
                    LIMIT 1
                ), '') <> ?;
            `, [storedUsername(username), event, username, event])
            await connection.query('SELECT RELEASE_LOCK(?)', [lockName])
            return results
        })
    }

    getMostRecentEvents() {
        log.debug('Getting most recent event for any user')
        return this.#db.withConnection(async connection => {
            const [results, _fields] = await connection.query(`
                SELECT t.id, t.username, t.event, t.timestamp
                FROM history t
                INNER JOIN (
                    SELECT username, MAX(id) AS max_id
                    FROM history
                    GROUP BY username
                ) AS sub
                ON t.username = sub.username AND t.id = sub.max_id
            `)
            return results.reduce((acc, {username, event, timestamp}) => {
                acc[username] = {event, timestamp}
                return acc
            }, {})
        })
    }

    getUserEvents(username) {
        log.debug(`Getting events for user: ${username}`)
        return this.#db.withConnection(async connection => {
            const [results, _fields] = await connection.query(`
                SELECT event, timestamp
                FROM (
                    SELECT
                        username,
                        event,
                        timestamp,
                        @prev_event := @current_event AS prev_event,
                        @current_event := event AS current_event,
                        @row_num := IF(@prev_event = event, @row_num + 1, 1) AS row_num
                    FROM (
                        SELECT username, event, timestamp
                        FROM history
                        WHERE username = ?
                        AND event != 'INACTIVE_UNKNOWN'
                        ORDER BY timestamp DESC
                    ) AS filtered_events
                    CROSS JOIN (SELECT @current_event := '', @prev_event := '', @row_num := 0) AS vars
                ) AS numbered_events
                WHERE row_num = 1
                ORDER BY timestamp DESC
                LIMIT 10
            `, [username])
            return results
        })
    }
}
