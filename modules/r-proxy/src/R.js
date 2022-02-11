const {spawn} = require('child_process')
const {CRAN_ROOT, GITHUB_ROOT, libPath, LOCAL_CRAN_REPO} = require('./config')
const {isCranPackageCached, isGitHubPackageSourceCached, getGitHubRepoPath, getGitHubTarget} = require('./filesystem')
const log = require('sepal/log').getLogger('R')

const runScript = (script, args, {showStdOut, showStdErr} = {}) =>
    new Promise((resolve, reject) => {
        log.trace(`Running script ${script} with args:`, args)
        const cmd = spawn(script, args)

        let stdout = ''
        let stderr = ''
    
        cmd.stdout.on('data', data => {
            const out = data.toString('utf8')
            if (showStdOut) {
                process.stdout.write(out)
            } else {
                stdout += out
            }
        })
    
        cmd.stderr.on('data', data => {
            const err = data.toString('utf8')
            if (showStdErr) {
                process.stdout.write(err)
            } else {
                stderr += err
            }
        })
    
        cmd.on('close', code =>
            code
                ? reject({code, stdout, stderr})
                : resolve(stdout)
        )
    })

const installCranPackage = async (name, version, repo) => {
    try {
        log.debug(`Installing ${name}/${version} from CRAN reposirory`)
        await runScript('src/R/install_cran_package.r', [name, version, libPath, repo])
        log.info(`Installed ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name}/${version} from CRAN repository`, error)
        return false
    }
}
    
const installLocalPackage = async (name, path) => {
    try {
        log.debug(`Installing ${name} (${path})`)
        await runScript('src/R/install_local_package.r', [name, path, libPath, LOCAL_CRAN_REPO])
        log.info(`Installed ${name} (${path})`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name} (${path})`, error)
        return false
    }
}
    
const installRemotePackage = async (name, url) => {
    try {
        log.debug(`Installing ${name} (${url})`)
        await runScript('src/R/install_remote_package.r', [name, url, libPath, LOCAL_CRAN_REPO])
        log.info(`Installed ${name} (${url})`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name} (${url})`, error)
        return false
    }
}
    
const bundleCranPackage = async (name, version) => {
    try {
        log.debug(`Bundling ${name}/${version}`)
        await runScript('src/R/bundle_cran_package.sh', [name, version, libPath, CRAN_ROOT], {showStdOut: true, showStdErr: true})
        log.info(`Bundled ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not bundle ${name}/${version}`, error)
        return false
    }
}

const bundleGitHubPackage = async (name, path) => {
    try {
        log.debug(`Bundling ${name} (${path})`)
        await runScript('src/R/bundle_github_package.sh', [name, path, libPath, GITHUB_ROOT], {showStdOut: true, showStdErr: true})
        log.info(`Bundled ${name} (${path})`)
        return true
    } catch (error) {
        log.warn(`Could not bundle ${name} (${path})`, error)
        return false
    }
}

const makeCranPackage = async (name, version, repo) =>
    await isCranPackageCached(name, version) || await installCranPackage(name, version, repo) && await bundleCranPackage(name, version)

const ensureGitHubPackageInstalled = async (name, path) =>
    await isGitHubPackageSourceCached(path)
        ? await installLocalPackage(name, getGitHubRepoPath('src', path))
        : await installRemotePackage(name, getGitHubTarget(path))
    
const makeGitHubPackage = async (name, path) =>
    await ensureGitHubPackageInstalled(name, path) && await bundleGitHubPackage(name, path)

module.exports = {
    makeCranPackage,
    makeGitHubPackage
}
