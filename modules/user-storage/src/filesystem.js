const {spawn} = require('child_process')
const {homeDir} = require('./config')
const path = require('path')
const fs = require('fs')
const log = require('#sepal/log').getLogger('filesystem')

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

const userHomePath = username =>
    path.join(homeDir, username)

const calculateUserStorage = async username => {
    log.debug(`Calculating storage for user ${username}`)
    const t0 = Date.now()
    const size = await diskUsage(userHomePath(username))
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
        log.warn(`Cannot erase storage for user ${username} at path ${userPath}`)
    }
}

module.exports = {
    calculateUserStorage, scanUserHomes, eraseUserStorage
}
