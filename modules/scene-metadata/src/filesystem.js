const {Readable} = require('stream')
const {pipeline} = require('stream/promises')
const {createWriteStream} = require('fs')
const {rm} = require('fs/promises')
const log = require('#sepal/log').getLogger('filesystem')
const {formatInterval} = require('./time')

const getPath = filename =>
    `${process.env.MYSQL_FILES_DIR}/${filename}`

const download = async ({url, collection}) => {
    const file = getPath(collection + '.csv.gz')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! ${response.status}`)

    const webStream = Readable.fromWeb(response.body)
    const fileStream = createWriteStream(file)
    
    try {
        log.debug(`Downloading file ${url}...`)
        const t0 = Date.now()
        await pipeline(
            webStream,
            fileStream
        )
        log.info(`Downloaded file ${url} (${formatInterval(t0)})`)
    } catch (error) {
        log.warn(`Could not download file ${url}`, error)
    }
}

const remove = async file => {
    log.debug(`Removing file ${file}`)
    try {
        await rm(file)
        log.info(`Removed file ${file}`)
    } catch (error) {
        log.warn(`Could not remove file ${file}`, error)
    }
}

module.exports = {download, remove}
