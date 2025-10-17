const {Subject, takeWhile, concatMap, from, firstValueFrom, of, map, ReplaySubject} = require('rxjs')
const {createGunzip} = require('zlib')
const {parse} = require('csv-parse')
const {stringify} = require('csv-stringify')
const {Transform, Writable} = require('stream')
const {pipeline} = require('stream/promises')
const {createWriteStream, createReadStream} = require('fs')
const log = require('#sepal/log').getLogger('csv')
const {formatInterval} = require('./time')
const {remove} = require('./filesystem')

const getPath = filename =>
    `${process.env.MYSQL_FILES_DIR}/${filename}`

const isInTimeRange = (timestamp, minTimestamp, maxTimestamp) =>
    (!minTimestamp || timestamp >= minTimestamp) && (!maxTimestamp || timestamp <= maxTimestamp)

const processCollection = async ({collection, sceneMapper, minTimestamp, maxTimestamp, chunkSize, chunkHandler}) => {
    const csvPath = getPath(`${collection}.csv.gz`)
    const inStream = createReadStream(csvPath)
    let readCount = 0
    let writeCount = 0
    let chunk = 1
    let outStream
    let updatedTimestamp

    const updateTimestamp = timestamp => {
        if (!updatedTimestamp || timestamp > updatedTimestamp) {
            updatedTimestamp = timestamp
        }
    }

    const getChunkFile = () =>
        getPath(`${collection}.${chunk}.csv`)

    const showStats = () =>
        log.info(`Processing collection ${collection}, in ${readCount}, out ${writeCount}`)

    const handleChunk = () => {
        if (outStream) {
            outStream.end()
        }
        chunkHandler(getChunkFile())
        chunk++
    }

    const mapRows = new Transform({
        objectMode: true,
        transform: (row, encoding, callback) => {
            readCount++
            if (readCount % 10000 === 0) {
                showStats()
            }

            const scene = sceneMapper({row, minTimestamp, maxTimestamp})
            if (scene) {
                updateTimestamp(scene.acquiredTimestamp)
                callback(null, scene)
            } else {
                callback()
            }
        }
    })

    const processRows = new Writable({
        objectMode: true,
        write: (row, encoding, callback) => {
            writeCount++
            if (writeCount % chunkSize === 1) {
                outStream = createWriteStream(getChunkFile())
            }
            outStream.write(row)
            if (writeCount % chunkSize === 0) {
                handleChunk()
            }
            callback()
        }
    })

    showStats()

    const t0 = Date.now()

    try {
        await pipeline(
            inStream,
            createGunzip(),
            parse({columns: true}),
            mapRows,
            stringify({header: false}),
            processRows
        )
        showStats()
        if (writeCount % chunkSize !== 0) {
            handleChunk()
        }
        await remove(csvPath)
    } catch (error) {
        log.warn(`Error while processing collection ${collection}`, error)
    }

    log.info(`Processed collection ${collection}, in ${readCount}, out ${writeCount} (${formatInterval(t0)})`)

    return updatedTimestamp
}

const ingest = async (database, path, timestamp, update) => {
    await database.ingest(path, timestamp, update)
}

const processCSV = async ({collection, sceneMapper, redis: {getLastUpdate, setLastUpdate}, database, maxTimestamp, timestamp, update}) => {
    const queue$ = new Subject()
    const done$ = new ReplaySubject(1)
    const minTimestamp = update
        ? await getLastUpdate(collection)
        : null

    queue$.pipe(
        concatMap(file => processFile$(file)),
        takeWhile(processed => processed),
    ).subscribe({
        error: error => {
            log.error(`Error while processing collection ${collection} - `, error)
            done$.error(error)
        },
        complete: () => {
            log.info('Finished processing collection:', collection)
            done$.next(true)
        }
    })

    const processFile$ = file => file
        ? from(processFile(file)).pipe(
            map(() => true)
        )
        : of(false)

    const processFile = async file => {
        await ingest(database, file, timestamp, update)
        await remove(file)
    }

    const chunkSize = 100000
    const chunkHandler = file => queue$.next(file)
    const updatedTimestamp = await processCollection({collection, sceneMapper, minTimestamp, maxTimestamp, chunkSize, chunkHandler})

    setImmediate(() => queue$.next(null))

    await firstValueFrom(done$)
    await setLastUpdate(collection, updatedTimestamp)
}

module.exports = {isInTimeRange, processCSV}
