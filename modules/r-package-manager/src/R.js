const {spawn} = require('child_process')
const {cranRoot, lib} = require('./config')
const log = require('sepal/log').getLogger('R')
const Path = require('path')
const {getPackageFileVersion} = require('./filesystem')

const getPackageFilename = path => {
    return Path.basename(path)
}

const runScript = (script, args) =>
    new Promise((resolve, reject) => {
        log.trace(`Running script ${script} with args:`, args)
        const cmd = spawn(script, args)

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
                : resolve(result)
        )
    })

// const downloadPackage = async name => {
//     try {
//         log.trace(`Downloading ${name}`)
//         const path = await runScript('src/R/download_package.sh', [name, cranRoot])
//         const filename = getPackageFilename(path)
//         const version = getPackageFileVersion(filename)
//         log.debug(`Downloaded ${path}`)
//         return {name, path, filename, version}
//     } catch (error) {
//         log.warn(`Could not download ${name}`, error)
//     }
// }

const downloadPackage = async (name, version) => {
    try {
        log.trace(`Downloading ${name}`)
        // const path = await runScript('src/R/download_package.r', [name, cranRoot])
        const path = await runScript('src/R/download_package.sh', [name, version, cranRoot])
        // const filename = getPackageFilename(path)
        // const version = getPackageFileVersion(filename)
        log.debug(`Downloaded ${path}`)
        // return {name, path, filename, version}
    } catch (error) {
        log.warn(`Could not download ${name}`, error)
    }
}

const installPackage = async (url, version) => {
    try {
        log.trace(`Installing ${url}`)
        await runScript('src/R/install_package.r', [url, version, lib])
        log.debug(`Installed ${url}`)
    } catch (error) {
        log.warn(`Could not install ${url}`)
    }
}

const checkVersion = async (name, version) => {
    try {
        log.trace(`Comparing version of ${name} with ${version}`)
        const result = await runScript('src/R/check_package_version.r', [name, version])
        const isOld = result === 'TRUE'
        log.debug(`Compared version of ${name} with ${version}:`, isOld ? 'old' : 'up-to-date')
        return isOld
    } catch (error) {
        log.warn(`Could not compare version for ${name} with ${version}`, error)
    }
}

const makeBinaryPackage = async (name, version) =>
    runScript('src/R/make_binary_package.sh', [name, version, lib, cranRoot])

module.exports = {
    downloadPackage, installPackage, checkVersion, makeBinaryPackage
}
