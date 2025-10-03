const mysql = require('mysql2/promise')
const {formatInterval} = require('./time')
const log = require('#sepal/log').getLogger('database')

const CURRENT_DATABASE_NAME = 'sdms'
const NEW_DATABASE_NAME = 'sdms_new'
const OLD_DATABASE_NAME = 'sdms_old'
const TABLE_NAME = 'scene_meta_data'

const transaction = {
    connection: null
}

const initializeDatabase = async () => {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: CURRENT_DATABASE_NAME,
        connectionLimit: 5,
    })

    const dropDatabase = async name => {
        log.debug(`Dropping database ${name}...`)
        await pool.execute(`
            DROP DATABASE IF EXISTS ${name}
        `)
        log.info(`Dropped database ${name}`)
    }

    const createDatabase = async name => {
        log.debug(`Creating database ${name}...`)
        await pool.execute(`
            CREATE DATABASE IF NOT EXISTS ${name}
        `)
        log.info(`Created database ${name}`)
    }

    const createTable = async () => {
        log.debug('Cloning table structure...')
        await pool.execute(`
            CREATE TABLE ${NEW_DATABASE_NAME}.${TABLE_NAME}
            LIKE ${CURRENT_DATABASE_NAME}.${TABLE_NAME}
        `)
        log.info('Cloned table structure')
    }

    const cleanup = async () => {
        log.debug('Cleaning up database...')
        await dropDatabase(OLD_DATABASE_NAME)
        await dropDatabase(NEW_DATABASE_NAME)
        log.debug('Cleaned up database')
    }

    const prepare = async () => {
        log.debug('Preparing database...')
        await cleanup()
        await createDatabase(OLD_DATABASE_NAME)
        await createDatabase(NEW_DATABASE_NAME)
        await createTable()
        // await pool.execute('SET unique_checks = 0')
        // await pool.execute('SET foreign_key_checks = 0')
        // await pool.execute('SET sql_log_bin = 0')
        // await pool.execute('SET GLOBAL innodb_flush_log_at_trx_commit = 2')
        log.info('Prepared database')
    }
    
    const ingest = async (csvFile, timestamp, update = false) => {
        log.debug(`Ingesting data from file ${csvFile}`)
        const updateTime = timestamp.toISOString()
        const table = `${update ? CURRENT_DATABASE_NAME : NEW_DATABASE_NAME}.${TABLE_NAME}`
        const t0 = Date.now()
        try {
            await pool.query(`
                LOAD DATA
                    INFILE '${csvFile}'
                    IGNORE
                    INTO TABLE ${table}
                    FIELDS TERMINATED BY ',' 
                    OPTIONALLY ENCLOSED BY '"'
                    LINES TERMINATED BY '\n'
                    IGNORE 0 ROWS
                    (id, meta_data_source, sensor_id, scene_area_id, @acquisition_date, day_of_year, cloud_cover, sun_azimuth, sun_elevation, browse_url)
                    SET acquisition_date = STR_TO_DATE(@acquisition_date, '%Y-%m-%dT%H:%i:%s.%fZ'),
                        update_time = STR_TO_DATE('${updateTime}', '%Y-%m-%dT%H:%i:%s.%fZ');
            `)
            log.info(`Data ingested from file ${csvFile} (${formatInterval(t0)})`)
        } catch (error) {
            log.warn(`Data not ingested from file ${csvFile}`, error)
        }
    }

    const swapTable = async () => {
        log.debug('Swapping table...')
        await pool.execute(`
            RENAME TABLE
                ${CURRENT_DATABASE_NAME}.${TABLE_NAME} TO ${OLD_DATABASE_NAME}.${TABLE_NAME},
                ${NEW_DATABASE_NAME}.${TABLE_NAME} TO ${CURRENT_DATABASE_NAME}.${TABLE_NAME}
        `)
        log.info('Swapped table')
    }

    const finalize = async () => {
        log.debug('Finalizing...')
        await swapTable()
        // await pool.execute('SET unique_checks = 1')
        // await pool.execute('SET foreign_key_checks = 1')
        // await pool.execute('SET sql_log_bin = 1')
        // await pool.execute('SET GLOBAL innodb_flush_log_at_trx_commit = 1')
        await cleanup()
        log.info('Finalized')
    }

    process.on('SIGINT', async () => {
        log.info('Shutting down...')
        try {
            await pool.destroy()
        } catch {
            // ignore
        }
        process.exit()
    })

    const mapValues = ({sceneId, source, dataSet, sceneAreaId, acquiredTimestamp, dayOfYear, cloudCover, sunAzimuth, sunElevation, thumbnailUrl}, timestamp) =>
        ([sceneId, source, dataSet, sceneAreaId, new Date(acquiredTimestamp), dayOfYear, cloudCover, sunAzimuth, sunElevation, thumbnailUrl, timestamp])

    const beginTransaction = async () => {
        if (transaction.connection) {
            throw new Error('Cannot begin, transaction already in progress')
        } else {
            log.debug('Starting transaction...')
            transaction.connection = await pool.getConnection()
            await transaction.connection.beginTransaction()
            log.info('Transaction started')
        }
    }

    const commitTransaction = async () => {
        if (transaction.connection) {
            log.debug('Committing transaction...')
            await transaction.connection.commit()
            transaction.connection.release()
            transaction.connection = null
            log.info('Transaction committed')
        } else {
            throw new Error('Cannot commit, no transaction in progress')
        }
    }

    const rollbackTransaction = async () => {
        if (transaction.connection) {
            log.debug('Rolling back transaction...')
            await transaction.connection.rollback()
            transaction.connection.release()
            transaction.connection = null
            log.info('Transaction rolled back')
        } else {
            throw new Error('Cannot rollback, no transaction in progress')
        }
    }

    const insert = async ({scenes, timestamp}) => {
        if (transaction.connection) {
            log.debug('Ingesting updates...')
            const t0 = Date.now()
            await transaction.connection.query(`
                INSERT IGNORE INTO ${CURRENT_DATABASE_NAME}.${TABLE_NAME}
                (id, meta_data_source, sensor_id, scene_area_id, acquisition_date, day_of_year, cloud_cover, sun_azimuth, sun_elevation, browse_url, update_time)
                VALUES ?
                `, [scenes.map(scene => mapValues(scene, timestamp))])
            log.info(`Updates ingested (${formatInterval(t0)})`)
        } else {
            throw new Error('Cannot insert, no transaction in progress')
        }
    }

    return {
        prepare, ingest, finalize, insert, beginTransaction, commitTransaction, rollbackTransaction
    }
}

module.exports = {initializeDatabase}
