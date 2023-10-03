const Path = require('path')
const {opendir} = require('fs/promises')
const {isChildOf, isFile} = require('./filesystem')
const {GITHUB_ROOT, LOCAL_CRAN_REPO, libPath} = require('./config')
const {runScript} = require('./script')
const {makePackage, cleanupPackage} = require('./package')
const log = require('#sepal/log').getLogger('github')

const SRC = 'src'
const BIN = 'bin'
const TMP = '.bin'

const isGitHubRepoPath = path =>
    isChildOf(GITHUB_ROOT, path)

const getGitHubRepoPath = (section, path = '') => {
    if (![SRC, BIN].includes(section)) {
        throw new Error('Illegal section:', section)
    }
    const repoPath = Path.join(GITHUB_ROOT, section, path)
    if (!isGitHubRepoPath(repoPath)) {
        throw new Error('Illegal path:', path)
    }
    return repoPath
}

const getGitHubPackageInfo = path => {
    const GITHUB_MATCHER = /^(?:\/github\/)?(([^/]+)\/([^/]*)(.*)(\.tar\.gz))/
    const result = path.match(GITHUB_MATCHER)
    if (result) {
        const [_, path, user, name, ref, ext] = result
        return {path, user, name, ref, ext}
    }
    return null
}

const isGitHubPackageSourceCached = async path =>
    isFile(getGitHubRepoPath(SRC, path))

const getGitHubTarget = path =>
    `https://github.com/${path}`

const installLocalPackage = async (name, path) => {
    try {
        log.info(`Installing ${name} (${path})`)
        await runScript('install_local_package.r', [name, path, libPath, LOCAL_CRAN_REPO])
        log.info(`Installed ${name} (${path})`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name} (${path})`, error)
        return false
    }
}
        
const installRemotePackage = async (name, url) => {
    try {
        log.info(`Installing ${name} (${url})`)
        await runScript('install_remote_package.r', [name, url, libPath, LOCAL_CRAN_REPO])
        log.info(`Installed ${name} (${url})`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name} (${url})`, error)
        return false
    }
}

const ensureGitHubPackageInstalled = async (name, path) =>
    await isGitHubPackageSourceCached(path)
        ? await installLocalPackage(name, getGitHubRepoPath(SRC, path))
        : await installRemotePackage(name, getGitHubTarget(path))
        
const makeGitHubPackage = async (name, path) => {
    const srcPath = Path.join(GITHUB_ROOT, SRC, path)
    const binPath = Path.join(GITHUB_ROOT, BIN, path)
    const tmpPath = Path.join(GITHUB_ROOT, TMP, path)
    const success = await ensureGitHubPackageInstalled(name, path) && await makePackage(name, srcPath, binPath, tmpPath)
    await cleanupPackage(name, srcPath, binPath, tmpPath)
    return success
}
    
const updateGitHubPackage = async ({name, path}) => {
    log.info(`Updating: ${name} (${path})`)
    const success = await makeGitHubPackage(name, path, {force: true})
    return {success}
}
    
const checkGitHubUpdates = async enqueueUpdateGitHubPackage => {
    scanDir(enqueueUpdateGitHubPackage, getGitHubRepoPath(BIN))
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

module.exports = {getGitHubRepoPath, getGitHubPackageInfo, getGitHubTarget, makeGitHubPackage, updateGitHubPackage, checkGitHubUpdates}
