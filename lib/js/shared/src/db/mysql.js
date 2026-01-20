import mysql from 'mysql2/promise'
import Postgrator from 'postgrator'
import Log from '#sepal/log'
const log = Log.getLogger('database')
import {join} from 'path'

const {MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD} = process.env

const DEFAULT_CONNECTION_OPTIONS = {
    multipleStatements: false
}

const DEFAULT_POOL_OPTIONS = {
    connectionLimit: 5,
    multipleStatements: false
}

const getBaseProperties = database => {
    if (!MYSQL_HOST) {
        throw new Error('Missing MySQL host')
    }
    if (!MYSQL_USER) {
        throw new Error('Missing MySQL user')
    }
    if (!MYSQL_PASSWORD) {
        throw new Error('Missing MySQL password')
    }
    if (!database) {
        throw new Error('Missing MySQL database')
    }
    return {
        host: MYSQL_HOST,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database
    }
}

export const createConnection = async (database, connectionOptions = {}) => {
    log.debug('Creating MySQL connection for database:', database)
    return await mysql.createConnection({
        ...getBaseProperties(database),
        ...DEFAULT_CONNECTION_OPTIONS,
        ...connectionOptions
    })
}

export const createPool = async (database, poolOptions = {}) => {
    log.debug('Creating MySQL pool for database:', database)
    return await mysql.createPool({
        ...getBaseProperties(database),
        ...DEFAULT_POOL_OPTIONS,
        ...poolOptions
    })
}

const ensureDatabaseExists = async database => {
    log.debug(`Ensuring database ${database} exists...`)
    if (!database) {
        throw new Error('Missing MySQL database')
    }
    const connection = await createConnection('mysql')
    try {
        await connection.execute(`
            CREATE DATABASE IF NOT EXISTS ${database}
        `)
        log.info(`Ensured database ${database} exists`)
    } finally {
        connection.end()
    }
}

const migrateDatabase = async (database, path) => {
    log.debug(`Applying migrations to database ${database}`)

    if (!path) {
        throw new Error('Cannot migrate database - missing path')
    }
    
    const connection = await createConnection(database, {multipleStatements: true})

    try {
        const postgrator = new Postgrator({
            migrationPattern: join(path, '*'),
            driver: 'mysql',
            database,
            schemaTable: 'schema_version',
            execQuery: query => connection.query(query).then(([rows]) => ({rows}))
        })

        const maxVersion = await postgrator.getMaxVersion()
        const currentVersion = await postgrator.getDatabaseVersion()
        if (maxVersion > currentVersion) {
            await postgrator.migrate()
            log.info(`Applied migrations to database ${database}, updated from version ${currentVersion} to ${maxVersion}`)
        } else {
            log.info(`Skipped migrations to database ${database}, already on version ${currentVersion}`)
        }
    } finally {
        connection.end()
    }
}

export const initDatabase = async (database, migrationsPath) => {
    await ensureDatabaseExists(database)
    await migrateDatabase(database, migrationsPath)
}
