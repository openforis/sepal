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
    const connection = await getPool().getConnection()
    const lockName = `user_history_${username}`
    try {
        await connection.query('SELECT GET_LOCK(?, 5) AS got_lock', [lockName])
        const [results, _fields] = await connection.query(`
            INSERT INTO ${DATABASE_NAME}.${TABLE_NAME}
            (username, event, timestamp)
            SELECT ?, ?, NOW()
            WHERE COALESCE((
                SELECT event
                FROM ${DATABASE_NAME}.${TABLE_NAME}
                WHERE username = ?
                ORDER BY timestamp DESC
                LIMIT 1
            ), '') <> ?;    
        `, [username, event, username, event])
        await connection.query('SELECT RELEASE_LOCK(?)', [lockName])
        return results
    } finally {
        connection.release()
    }
}

const getMostRecentEvents = async () => {
    log.debug('Getting most recent event for any user')
    const [results, _fields] = await getPool().query(`
        SELECT t.id, t.username, t.event, t.timestamp
        FROM ${DATABASE_NAME}.${TABLE_NAME} t
        INNER JOIN (
            SELECT username, MAX(id) AS max_id
            FROM ${DATABASE_NAME}.${TABLE_NAME}
            GROUP BY username
        ) AS sub
        ON t.username = sub.username AND t.id = sub.max_id        
    `)
    return results.reduce((acc, {username, event, timestamp}) => {
        acc[username] = {event, timestamp}
        return acc
    }, {})
}

const getUserEvents = async username => {
    log.debug(`Getting events for user: ${username}`)
    const [results, _fields] = await getPool().query(`
        SELECT username, event, timestamp
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
                FROM ${DATABASE_NAME}.${TABLE_NAME}
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
}

module.exports = {
    initializeDatabase, addEvent, getMostRecentEvents, getUserEvents
}
