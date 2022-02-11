const readline = require('readline')
const https = require('https')
const {cranRepo} = require('./config')
const {getCranTarget, getGitHubRepoPath, isUpdatable, makeCranPackage} = require('./cran')
const {makeGitHubPackage} = require('./github')
const log = require('sepal/log').getLogger('update')
const {opendir} = require('fs/promises')
const Path = require('path')

const getAvailablePackages = () =>
    new Promise((resolve, reject) => {
        log.debug('Requesting PACKAGES file')
        try {
            const request = https.request(getCranTarget('PACKAGES', 'PACKAGES'), {
                method: 'GET'
            }, res => {
                if (res.statusCode === 200) {
                    log.debug('Loading PACKAGES file')
                    resolve(res)
                } else {
                    reject(res.statusCode)
                }
            })
            request.end()
        } catch (error) {
            reject(error)
        }
    })
    
const checkCranUpdates = async enqueueUpdateCranPackage => {
    log.info('Checking updated CRAN packages')
    const res = await getAvailablePackages()
    const rl = readline.createInterface({input: res})

    let name = null
    let version = null

    rl.on('line', line => {
        if (line.startsWith('Package: ')) {
            name = line.substring(9)
        }
        if (name && line.startsWith('Version: ')) {
            version = line.substring(9)
            enqueueUpdateCranPackage(name, version)
            name = null
        }
    })

    rl.on('close', () => {
        log.info('Checked availables packages')
    })
}

const checkGitHubUpdates = async enqueueUpdateGitHubPackage => {
    scanDir(enqueueUpdateGitHubPackage, getGitHubRepoPath('bin'))
}

const getGitHubPackageInfo = path => {
    const GITHUB_MATCHER = /^(([^/]+)\/([^/]*)(.*)(\.tar\.gz))/
    const result = path.match(GITHUB_MATCHER)
    if (result) {
        const [_, path, user, name, ref, ext] = result
        return {path, user, name, ref, ext}
    }
    return null
}

const scanDir = async (enqueueUpdateGitHubPackage, baseDir, dir = '') => {
    try {
        for await (const dirent of await opendir(Path.join(baseDir, dir))) {
            const path = Path.join(dir, dirent.name)
            if (dirent.isDirectory()) {
                await scanDir(enqueueUpdateGitHubPackage, baseDir, path)
            } else if (dirent.isFile()) {
                const packageInfo = getGitHubPackageInfo(path)
                if (packageInfo) {
                    const {name} = packageInfo
                    enqueueUpdateGitHubPackage(name, path)
                }
            }
        }
    } catch (error) {
        log.error(error)
    }
}

const updateCranPackage = async ({name, version}) => {
    log.debug(`Processing CRAN update: ${name}/${version}`)
    if (await isUpdatable(name, version)) {
        const success = await makeCranPackage(name, version, cranRepo)
        log.debug(`Processed CRAN update: ${name}/${version}`)
        return {success}
    } else {
        log.debug(`Skipped CRAN update:${name}/${version}`)
        return {success: true}
    }
}

const updateGitHubPackage = async ({name, path}) => {
    log.debug(`Processing GitHub update: ${path}`)
    const success = await makeGitHubPackage(name, path, {force: true})
    log.debug(`Processed GitHub update: ${path}`)
    return {success}
}

module.exports = {checkCranUpdates, checkGitHubUpdates, updateCranPackage, updateGitHubPackage}
