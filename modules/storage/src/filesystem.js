import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {getLogger} from '#sepal/log'

import {homeDir} from './config.js'

const log = getLogger('filesystem')

const command = async callback =>
    new Promise((resolve, reject) => {
        let result = ''
        const cmd = callback()
    
        cmd.stdout.on('data', data =>
            result += data.toString('utf8')
        )
    
        cmd.stderr.on('data', error =>
            reject(error.toString('utf8'))
        )
    
        cmd.on('close', code =>
            code
                ? reject(code)
                : resolve(result)
        )
    })

const diskUsage = async path => {
    log.debug(`Calculating size of path ${path}`)
    const result = await command(
        () => spawn('sudo', ['diskus', '-v', path])
    )
    return Number(result)
}

// Sees into homes the node user cannot read.
const sudoIsDirectory = async dir => {
    const found = await command(
        () => spawn('sudo', ['find', path.dirname(dir), '-mindepth', '1', '-maxdepth', '1', '-name', path.basename(dir), '-type', 'd'])
    )
    return found.trim() !== ''
}

const userHomePath = username =>
    path.join(homeDir, username)

// Image exports to Data stage their files in the home on their way to Data, where they count once uploaded.
// diskus cannot exclude a folder, so the staging is measured on its own and subtracted.
const DATA_STAGING = '.data-staging'

const calculateUserStorage = async (username, {usage = diskUsage, isDirectory = sudoIsDirectory} = {}) => {
    log.debug(`Calculating storage for user ${username}`)
    const t0 = Date.now()
    const home = userHomePath(username)
    const total = await usage(home)
    const staging = path.join(home, DATA_STAGING)
    const size = await isDirectory(staging)
        ? Math.max(0, total - await usage(staging))
        : total
    const t1 = Date.now()
    log.info(`Calculated storage for user ${username}: ${size} bytes [${t1 - t0} ms]`)
    return size
}

const scanUserHomes = async callback => {
    const dir = await fs.promises.opendir(homeDir)
    for await (const dirent of dir) {
        if (dirent.isDirectory()) {
            const username = dirent.name
            if (username) {
                await callback(username)
            } else {
                log.error('Directory entry unexpectedly doesn\'t have a name', dirent)
            }
        }
    }
}

const eraseUserStorage = async username => {
    const userPath = userHomePath(username)
    log.debug(`Erasing storage for user ${username} at path ${userPath}`)
    try {
        await command(
            () => spawn('sudo', ['find', userPath, '-mindepth', '1', '-delete'])
        )
        log.info(`Erased storage for user ${username} at path ${userPath}`)
    } catch (error) {
        log.warn(`Cannot erase storage for user ${username} at path ${userPath}`, error)
    }
}

export {
    calculateUserStorage, eraseUserStorage,
    scanUserHomes}
