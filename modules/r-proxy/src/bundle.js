const {libPath} = require('./config')
const {runScript} = require('./script')
const log = require('#sepal/log').getLogger('bundle')

const bundlePackage = async (name, srcPath, binPath, tmpPath) => {
    try {
        log.debug(`Bundling ${name} (${srcPath})`)
        await runScript('bundle_package.sh', [name, srcPath, binPath, tmpPath, libPath, 'build'], {showStdOut: true, showStdErr: true})
        log.info(`Bundled ${name} (${srcPath})`)
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
        log.info(`Verified ${name} (${tmpPath})`)
        return true
    } catch (error) {
        log.warn(`Could not verify ${name} (${tmpPath})`, error)
        return false
    }
}
    
const deployPackage = async (name, srcPath, binPath, tmpPath) => {
    try {
        log.debug(`Deploying ${name} (${binPath})`)
        await runScript('bundle_package.sh', [name, srcPath, binPath, tmpPath, libPath, 'deploy'], {showStdOut: true, showStdErr: true})
        log.info(`Deployed ${name} (${binPath})`)
        return true
    } catch (error) {
        log.warn(`Could not deploy ${name} (${binPath})`, error)
        return false
    }
}
    
const cleanupPackage = async (name, srcPath, binPath, tmpPath) => {
    try {
        log.debug(`Cleaning up ${name} (${srcPath})`)
        await runScript('bundle_package.sh', [name, srcPath, binPath, tmpPath, libPath, 'cleanup'], {showStdOut: true, showStdErr: true})
        log.info(`Cleaned up ${name} (${srcPath})`)
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
    return success
}

module.exports = {makePackage, cleanupPackage}
