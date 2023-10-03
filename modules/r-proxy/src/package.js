const {libPath} = require('./config')
const {runScript} = require('./script')
const log = require('#sepal/log').getLogger('package')

const bundlePackage = async (name, srcPath, binPath, tmpPath) => {
    try {
        log.debug(`Bundling ${name} (${srcPath})`)
        await runScript('make_package.sh', [name, srcPath, binPath, tmpPath, libPath, 'bundle'], {showStdOut: true, showStdErr: true})
        log.debug(`Bundled ${name} (${srcPath})`)
        return true
    } catch (error) {
        log.warn(`Could not bundle ${name} (${srcPath})`, error)
        return false
    }
}
    
const verifyPackage = async (name, tmpPath) => {
    try {
        log.debug(`Verifying ${name} (${tmpPath})`)
        await runScript('verify_package.r', [name, tmpPath, libPath])
        log.debug(`Verified ${name} (${tmpPath})`)
        return true
    } catch (error) {
        log.warn(`Could not verify ${name} (${tmpPath})`, error)
        return false
    }
}
    
const deployPackage = async (name, srcPath, binPath, tmpPath) => {
    try {
        log.debug(`Deploying ${name} (${binPath})`)
        await runScript('make_package.sh', [name, srcPath, binPath, tmpPath, libPath, 'deploy'], {showStdOut: true, showStdErr: true})
        log.debug(`Deployed ${name} (${binPath})`)
        return true
    } catch (error) {
        log.warn(`Could not deploy ${name} (${binPath})`, error)
        return false
    }
}
    
const cleanupPackage = async (name, srcPath, binPath, tmpPath) => {
    try {
        log.debug(`Cleaning up ${name} (${srcPath})`)
        await runScript('make_package.sh', [name, srcPath, binPath, tmpPath, libPath, 'cleanup'], {showStdOut: true, showStdErr: true})
        log.debug(`Cleaned up ${name} (${srcPath})`)
        return true
    } catch (error) {
        log.warn(`Could not clean up ${name} (${srcPath})`, error)
        return false
    }
}

const makePackage = async (name, srcPath, binPath, tmpPath) => {
    const success = await bundlePackage(name, srcPath, binPath, tmpPath)
        && await verifyPackage(name, tmpPath)
        && await deployPackage(name, srcPath, binPath, tmpPath)
    success && log.info(`Packaged ${name} (${srcPath})`)
    return success
}

module.exports = {makePackage, cleanupPackage}
