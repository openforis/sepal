import {createWriteStream} from 'fs'
import {rename, rm} from 'fs/promises'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'

import {getLogger} from '#sepal/log'

import {formatInterval} from './time.js'

const log = getLogger('filesystem')

export const download = async ({url, collection}) => {
    const file = getPath(collection + '.csv.gz')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! ${response.status}`)
    log.info(`Downloading file ${url}...`)
    const t0 = Date.now()
    await pipeline(Readable.fromWeb(response.body), createWriteStream(file + '.part'))
    await rename(file + '.part', file)
    log.info(`Downloaded file ${url} (${formatInterval(t0)})`)
}

export const remove = async file => {
    log.debug(`Removing file ${file}`)
    try {
        await rm(file, {force: true})
        log.info(`Removed file ${file}`)
    } catch (error) {
        log.warn(`Could not remove file ${file}`, error)
    }
}

const getPath = filename =>
    `${process.env.MYSQL_FILES_DIR}/${filename}`
