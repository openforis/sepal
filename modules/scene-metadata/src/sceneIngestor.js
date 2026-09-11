import {getLogger} from '#sepal/log'

import {formatInterval} from './time.js'

const log = getLogger('database')
const TABLE_NAME = 'scene_meta_data'

export class SceneIngestor {
    #db

    constructor(db) {
        this.#db = db
    }

    async prepare() {
        await this.#db.withConnection(async connection => {
            const names = await this.#databaseNames(connection)
            await this.#cleanup(connection, names)
            await connection.query('CREATE DATABASE ??', [names.backup])
            await connection.query('CREATE DATABASE ??', [names.staging])
            await connection.query('CREATE TABLE ??.?? LIKE ??.??', [names.staging, TABLE_NAME, names.current, TABLE_NAME])
            await connection.query('ALTER TABLE ??.?? ENGINE = MyISAM', [names.staging, TABLE_NAME])
        })
        log.info('Prepared database')
    }

    async ingest(csvFile, timestamp) {
        const t0 = Date.now()
        await this.#db.withConnection(async connection => {
            const {staging} = await this.#databaseNames(connection)
            await connection.query(`
                LOAD DATA INFILE ? IGNORE INTO TABLE ??.??
                FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
                LINES TERMINATED BY '\n'
                IGNORE 0 ROWS
                (id, meta_data_source, sensor_id, scene_area_id, @acquisition_date, day_of_year, cloud_cover, sun_azimuth, sun_elevation)
                SET acquisition_date = STR_TO_DATE(@acquisition_date, '%Y-%m-%dT%H:%i:%s.%fZ'),
                    update_time = STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%s.%fZ')
            `, [csvFile, staging, TABLE_NAME, timestamp.toISOString()])
        })
        log.info(`Data ingested from file ${csvFile} (${formatInterval(t0)})`)
    }

    async publish() {
        await this.#db.withConnection(async connection => {
            const {current, staging, backup} = await this.#databaseNames(connection)
            await connection.query('RENAME TABLE ??.?? TO ??.??, ??.?? TO ??.??', [
                current, TABLE_NAME, backup, TABLE_NAME, staging, TABLE_NAME, current, TABLE_NAME
            ])
        })
        log.info('Published catalogue')
    }

    async cleanup() {
        await this.#db.withConnection(async connection => {
            await this.#cleanup(connection, await this.#databaseNames(connection))
        })
    }

    async insert({scenes, timestamp}) {
        log.debug('Ingesting updates...')
        const t0 = Date.now()
        await this.#db.withConnection(connection => connection.query(`
            INSERT IGNORE INTO ${TABLE_NAME}
            (id, meta_data_source, sensor_id, scene_area_id, acquisition_date, day_of_year, cloud_cover, sun_azimuth, sun_elevation, update_time)
            VALUES ?
            `, [scenes.map(scene => this.#mapValues(scene, timestamp))]))
        log.info(`Updates ingested (${formatInterval(t0)})`)
    }

    async #databaseNames(connection) {
        const [[{dbName}]] = await connection.query('SELECT DATABASE() AS dbName')
        return {current: dbName, staging: `${dbName}_new`, backup: `${dbName}_old`}
    }

    async #cleanup(connection, {staging, backup}) {
        await connection.query('DROP DATABASE IF EXISTS ??', [backup])
        await connection.query('DROP DATABASE IF EXISTS ??', [staging])
    }

    #mapValues({id, source, dataset, sceneAreaId, acquiredTimestamp, dayOfYear, cloudCover, sunAzimuth, sunElevation}, timestamp) {
        return [id, source, dataset, sceneAreaId, new Date(acquiredTimestamp), dayOfYear, cloudCover, sunAzimuth, sunElevation, timestamp]
    }
}
