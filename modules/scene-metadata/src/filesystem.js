import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {createWriteStream} from 'fs'
import {rm} from 'fs/promises'
import {getLogger} from '#sepal/log'
const log = getLogger('filesystem')
import {formatInterval} from './time.js'

const getPath = filename =>
    `${process.env.MYSQL_FILES_DIR}/${filename}`

const download = async ({url, collection}) => {
    const file = getPath(collection + '.csv.gz')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! ${response.status}`)

    const webStream = Readable.fromWeb(response.body)
    const fileStream = createWriteStream(file)
    
    try {
        log.info(`Downloading file ${url}...`)
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

export {download, remove}
