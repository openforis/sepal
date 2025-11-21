const log = require('#sepal/log').getLogger('database')

const {join} = require('path')
const {initDatabase, createPool} = require('#sepal/db/mysql')

const DATABASE_NAME = 'user_storage'
const TABLE_NAME = 'history'

const state = {}

const migrationsPath = join(__dirname, '/../migrations')

const initializeDatabase = async () => {
    await initDatabase(DATABASE_NAME, migrationsPath)
    state.pool = await createPool(DATABASE_NAME)
}

const getPool = () => {
    if (state.pool) {
        return state.pool
    } else {
        throw new Error('Connection to database unavailable')
    }
}

const addEvent = async ({username, event}) => {
    log.debug(`Adding event to ${username}: ${event}`)
    const [results, _fields] = await getPool().query(`
        INSERT INTO ${DATABASE_NAME}.${TABLE_NAME}
        (username, event, timestamp)
        SELECT ?, ?, NOW()
        WHERE IFNULL((
            SELECT event
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            WHERE username = ?
            ORDER BY timestamp DESC
            LIMIT 1
        ), '') <> ?
    `, [username, event, username, event])
    return results
}

const getMostRecentEvents = async () => {
    log.debug('Getting most recent event for any user')
    const [results, _fields] = await getPool().query(`
        SELECT h.username, h.event, h.timestamp
        FROM ${DATABASE_NAME}.${TABLE_NAME} h
        JOIN (
            SELECT username, MAX(timestamp) AS max_ts
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            GROUP BY username
        ) m ON h.username = m.username
        AND h.timestamp = m.max_ts
        ORDER BY h.username
    `)
    return results.reduce((acc, {username, event, timestamp}) => {
        acc[username] = {event, timestamp}
        return acc
    }, {})
}

const getUserEvents = async username => {
    log.debug(`Getting events for user: ${username}`)
    const [results, _fields] = await getPool().query(`
        SELECT event, timestamp
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE username = ?
        ORDER BY timestamp DESC
        LIMIT 100
    `, [username])
    return results
}

module.exports = {
    initializeDatabase, addEvent, getMostRecentEvents, getUserEvents
}
