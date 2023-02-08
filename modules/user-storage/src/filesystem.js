const {spawn} = require('child_process')
const {homeDir} = require('./config')
const path = require('path')
const fs = require('fs')
const log = require('#sepal/log').getLogger('filesystem')

const diskUsage = path =>
    new Promise((resolve, reject) => {
        log.trace(`Calculating size of path ${path}`)
        const cmd = spawn('sudo', ['diskus', '-v', path])

        let result = ''
    
        cmd.stdout.on('data', data =>
            result += data.toString('utf8')
        )
    
        cmd.stderr.on('data', error =>
            reject(error.toString('utf8'))
        )
    
        cmd.on('close', code =>
            code
                ? reject(code)
                : resolve(Number(result))
        )
    })

const userHomePath = username =>
    path.join(homeDir, username)

const calculateUserStorage = async username => {
    log.trace(`Calculating storage for user ${username}`)
    const t0 = Date.now()
    const size = await diskUsage(userHomePath(username))
    const t1 = Date.now()
    log.debug(`Calculated storage for user ${username}: ${size} bytes [${t1 - t0} ms]`)
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

module.exports = {
    calculateUserStorage, scanUserHomes
}
