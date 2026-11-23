import {createReadStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'

import {from as copyFrom} from 'pg-copy-streams'

import {getLogger} from '#sepal/log'

import {formatInterval} from './time.js'

const log = getLogger('database')

// The catalogue is rebuilt into `staging` and swapped in; the catalogue it replaces is kept in `backup`
// until the next cleanup.
const DROP_SCHEMAS = 'DROP SCHEMA IF EXISTS staging, backup CASCADE'

export class SceneIngestor {
    #db

    constructor(db) {
        this.#db = db
    }

    async prepare() {
        await this.#db.withTransaction(async connection => {
            await connection.query(DROP_SCHEMAS)
            await connection.query('CREATE SCHEMA staging')
            await connection.query('CREATE SCHEMA backup')
            await connection.query(CREATE_LOAD_TABLE)
            await connection.query(CREATE_ROWS_TABLE)
        })
        log.info('Prepared database')
    }

    // A chunk loads as a whole or not at all. Rows keep their file order in `seq`, so publication can keep
    // the first of two rows with the same id.
    async ingest(csvFile, timestamp) {
        const t0 = Date.now()
        await this.#db.withTransaction(async connection => {
            await pipeline(createReadStream(csvFile), connection.query(copyFrom(COPY_CHUNK)))
            await connection.query(INSERT_LOADED, [timestamp])
            await connection.query('TRUNCATE staging.scene_load')
        })
        log.info(`Data ingested from file ${csvFile} (${formatInterval(t0)})`)
    }

    // Indexes are built once over the loaded rows rather than maintained row by row, which made each chunk
    // slower as they outgrew memory.
    async publish() {
        const t0 = Date.now()
        await this.#db.withTransaction(async connection => {
            await connection.query('CREATE TABLE staging.scene (LIKE public.scene INCLUDING ALL EXCLUDING INDEXES)')
            await connection.query(INSERT_FIRST_ROWS)
            await connection.query('DROP TABLE staging.scene_rows')
            await connection.query(CREATE_INDEXES)
            await connection.query('ANALYZE staging.scene')
            await connection.query('ALTER TABLE public.scene SET SCHEMA backup')
            await connection.query('ALTER TABLE staging.scene SET SCHEMA public')
        })
        log.info(`Published catalogue (${formatInterval(t0)})`)
    }

    async cleanup() {
        await this.#db.withConnection(connection => connection.query(DROP_SCHEMAS))
    }

    async insert({scenes, timestamp}) {
        log.debug('Ingesting updates...')
        const t0 = Date.now()
        await this.#db.withConnection(connection => connection.query(`
            INSERT INTO scene
            (id, meta_data_source, sensor_id, scene_area_id, acquisition_date, day_of_year, cloud_cover, sun_azimuth, sun_elevation, update_time)
            SELECT *, $10::timestamptz
            FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::smallint[], $7::float8[], $8::float8[], $9::float8[])
            ON CONFLICT (id) DO NOTHING
        `, [...columns(scenes), timestamp]))
        log.info(`Updates ingested (${formatInterval(t0)})`)
    }
}

const COLUMNS = 'id, meta_data_source, sensor_id, scene_area_id, acquisition_date, day_of_year, cloud_cover, sun_azimuth, sun_elevation'

// Unlogged and unindexed: they are only read once, at publication, and a crash restarts the rebuild anyway.
// `seq` keeps counting across the chunks of a rebuild, since TRUNCATE leaves the identity alone.
const CREATE_LOAD_TABLE = `
    CREATE UNLOGGED TABLE staging.scene_load (
        seq              bigint GENERATED ALWAYS AS IDENTITY,
        id               varchar(255),
        meta_data_source varchar(255),
        sensor_id        varchar(255),
        scene_area_id    varchar(255),
        acquisition_date timestamptz(0),
        day_of_year      smallint,
        cloud_cover      double precision,
        sun_azimuth      double precision,
        sun_elevation    double precision
    )`

const CREATE_ROWS_TABLE = 'CREATE UNLOGGED TABLE staging.scene_rows (seq bigint NOT NULL, LIKE public.scene)'

const COPY_CHUNK = `COPY staging.scene_load (${COLUMNS}) FROM STDIN WITH (FORMAT csv)`

const INSERT_LOADED = `
    INSERT INTO staging.scene_rows (seq, ${COLUMNS}, update_time)
    SELECT seq, ${COLUMNS}, $1::timestamptz FROM staging.scene_load`

const INSERT_FIRST_ROWS = `
    INSERT INTO staging.scene (${COLUMNS}, update_time)
    SELECT DISTINCT ON (id) ${COLUMNS}, update_time FROM staging.scene_rows ORDER BY id, seq`

// The names a fresh migration gives the indexes.
const CREATE_INDEXES = `
    ALTER TABLE staging.scene ADD CONSTRAINT scene_pkey PRIMARY KEY (id);
    CREATE INDEX scene_scene_area_id_acquisition_date_day_of_year_idx
        ON staging.scene (scene_area_id, acquisition_date, day_of_year)`

const columns = scenes => [
    scenes.map(({id}) => id),
    scenes.map(({source}) => source),
    scenes.map(({dataset}) => dataset),
    scenes.map(({sceneAreaId}) => sceneAreaId),
    scenes.map(({acquiredTimestamp}) => new Date(acquiredTimestamp)),
    scenes.map(({dayOfYear}) => dayOfYear),
    scenes.map(({cloudCover}) => cloudCover),
    scenes.map(({sunAzimuth}) => sunAzimuth),
    scenes.map(({sunElevation}) => sunElevation)
]
