import {parse} from 'csv-parse'
import {stringify} from 'csv-stringify'
import {createReadStream, createWriteStream} from 'fs'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {createGunzip} from 'zlib'

import {getLogger} from '#sepal/log'

import {remove} from './filesystem.js'

const log = getLogger('csv')

export const processCSV = async ({collection, sceneMapper, database, maxTimestamp, timestamp, chunkSize = 100000}) => {
    const csvPath = getPath(`${collection}.csv.gz`)
    const checkpoints = {}
    await pipeline(
        createReadStream(csvPath),
        createGunzip(),
        parse({columns: true}),
        rows => selectScenes(rows, sceneMapper, maxTimestamp, checkpoints),
        scenes => chunkScenes(scenes, chunkSize),
        async chunks => {
            let chunk = 0
            for await (const scenes of chunks) {
                await ingestChunk(scenes, getPath(`${collection}.${++chunk}.csv`), database, timestamp)
            }
        }
    )
    await remove(csvPath)
    log.info(`Finished processing collection: ${collection}`)
    return checkpoints
}

const getPath = filename => `${process.env.MYSQL_FILES_DIR}/${filename}`

async function* selectScenes(rows, sceneMapper, maxTimestamp, checkpoints) {
    for await (const row of rows) {
        const scene = sceneMapper(row)
        if (scene && (!maxTimestamp || scene.acquiredTimestamp <= maxTimestamp)) {
            recordCheckpoint(checkpoints, scene)
            yield scene
        }
    }
}

const recordCheckpoint = (checkpoints, {dataset, acquiredTimestamp}) => {
    if (!checkpoints[dataset] || acquiredTimestamp > checkpoints[dataset]) {
        checkpoints[dataset] = acquiredTimestamp
    }
}

async function* chunkScenes(scenes, chunkSize) {
    let chunk = []
    for await (const scene of scenes) {
        chunk.push(scene)
        if (chunk.length === chunkSize) {
            yield chunk
            chunk = []
        }
    }
    if (chunk.length) yield chunk
}
const COLUMNS = ['id', 'source', 'dataset', 'sceneAreaId', 'acquiredTimestamp', 'dayOfYear', 'cloudCover', 'sunAzimuth', 'sunElevation']

const ingestChunk = async (scenes, path, database, timestamp) => {
    await pipeline(Readable.from(scenes), stringify({header: false, columns: COLUMNS}), createWriteStream(path))
    await database.ingest(path, timestamp)
    await remove(path)
}
