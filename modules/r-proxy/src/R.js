const {spawn} = require('child_process')
const {cranRoot, lib} = require('./config')
const {isBinaryPackageCached} = require('./filesystem')
const log = require('sepal/log').getLogger('R')

const runScript = (script, args) =>
    new Promise((resolve, reject) => {
        log.trace(`Running script ${script} with args:`, args)
        const cmd = spawn(script, args)

        let stdout = ''
        let stderr = ''
    
        cmd.stdout.on('data', data =>
            stdout += data.toString('utf8')
        )
    
        cmd.stderr.on('data', data =>
            stderr += data.toString('utf8')
        )
    
        cmd.on('close', code =>
            code
                ? reject({code, stderr})
                : resolve(stdout)
        )
    })

const installPackage = async (name, version, repo) => {
    try {
        log.debug(`Installing ${name}/${version}`)
        log.trace(await runScript('src/R/install_package.r', [name, version, lib, repo]))
        log.info(`Installed ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name}/${version}`, error)
        return false
    }
}
    
const bundlePackage = async (name, version) => {
    try {
        log.debug(`Bundling ${name}/${version}`)
        log.trace(await runScript('src/R/bundle_package.sh', [name, version, lib, cranRoot]))
        log.info(`Bundled ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not bundle ${name}/${version}`, error)
        return false
    }
}

const makeBinaryPackage = async (name, version, repo) =>
    await isBinaryPackageCached(name, version) || await installPackage(name, version, repo) && await bundlePackage(name, version)

module.exports = {
    makeBinaryPackage
}
