const fs = require('fs').promises
const log = require('#sepal/log').getLogger('git')
const {ClientException} = require('#sepal/exception')
const executeCommand = require('./terminal')

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000

const pathExists = async path => {
    try {
        await fs.access(path)
        return true
    } catch {
        return false
    }
}

const cloneRepository = async (repository, branch, appPath) => {
    log.debug(`Cloning ${repository} → ${appPath}`)
    const branchExists = await checkBranchExists(repository, branch)
    if (!branchExists) {
        log.error(`Branch '${branch}' not found in repository ${repository}`)
        throw new ClientException(`Branch '${branch}' not found in repository ${repository}`)
    }
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await executeCommand(
                'git', ['clone', `--branch=${branch}`, repository, appPath]
            )
            return
        } catch (err) {
            log.error(`Clone attempt ${attempt} failed: ${err.message}`)
            if (err.statusCode === 500) {
                throw err
            }
            if (attempt === MAX_RETRIES) {
                throw new ClientException(
                    `Failed to clone repository after multiple attempts: ${err}`
                )
            }
        }
        await new Promise(res => setTimeout(res, RETRY_DELAY_MS))
    }
}

const checkBranchExists = async (repository, branch) => {
    log.debug(`Checking branch ${branch} in ${repository}`)
    try {
        await executeCommand(
            'git', ['ls-remote', '--exit-code', '--heads', repository, branch]
        )
        return true
    } catch (err) {
        if (err.statusCode === 500) {
            log.error(`System error while checking branch: ${err.message}`)
            return false
        }
        log.warn(`Branch '${branch}' does not exist: ${err.message}`)
        return false
    }
}

const checkoutBranch = async (appPath, branch) => {
    try {
        log.info(`Setting repository to branch '${branch}' (fetching from remote)`)
        await executeCommand('git', ['fetch', 'origin', branch], {cwd: appPath})
        await executeCommand('git', ['checkout', branch], {cwd: appPath})
        
    } catch (err) {
        log.error(`Failed to checkout branch '${branch}': ${err.message}`)
        throw new ClientException(`Failed to checkout branch '${branch}': ${err.message}`)
    }
}

const getRepoInfo = async appPath => {
    const {stdout: commitTimestamp} = await executeCommand(
        'git', ['log', '-1', '--format=%cI'], {cwd: appPath}
    )
    const {stdout: commitId} = await executeCommand(
        'git', ['log', '-1', '--format=%H'], {cwd: appPath}
    )
    const {stdout: originUrlRaw} = await executeCommand(
        'git', ['config', '--get', 'remote.origin.url'], {cwd: appPath}
    )
    const {stdout: branchName} = await executeCommand(
        'git', ['rev-parse', '--abbrev-ref', 'HEAD'], {cwd: appPath}
    )
    const originUrl = originUrlRaw.trim()
  
    let commitUrl = null
    if (originUrl.includes('github.com')) {
        let repoUrl = originUrl
            .replace(/^git@github\.com:/, 'https://github.com/')
            .replace(/\.git$/, '')
        commitUrl = `${repoUrl}/commit/${commitId.trim()}`
    }

    let updateAvailable = false
    try {
        await executeCommand('git', ['remote', 'update'], {cwd: appPath})
        const {stdout: local} = await executeCommand('git', ['rev-parse', 'HEAD'], {cwd: appPath})
        const {stdout: remote} = await executeCommand('git', ['rev-parse', '@{u}'], {cwd: appPath})
        updateAvailable = local.trim() !== remote.trim()
    } catch (warnErr) {
        log.warn(`Could not check remote updates: ${warnErr.message}`)
    }

    const appInfo = {
        lastCloneTimestamp: commitTimestamp.trim() || null,
        lastCommitId: commitId.trim(),
        url: originUrl,
        commitUrl,
        branch: branchName.trim(),
        updateAvailable
    }

    log.debug(`Repository info for ${appPath}:`, appInfo)

    return appInfo

}

const cloneOrPull = async ({path: appPath, repository, branch}) => {
    try {
        const exists = await pathExists(appPath)
        if (!exists) {
            log.info(`Path '${appPath}' not found → cloning`)
            await cloneRepository(repository, branch, appPath)
            await checkoutBranch(appPath, branch)
            return {action: 'cloned', success: true}
        }
        return await pullUpdates(appPath, branch)
        
    } catch (err) {
        log.error(`Error in cloneOrPull: ${err.message}`)
        if (err.statusCode === 500) {
            return {action: 'system-error', success: false, error: err.message}
        }
        throw err
    }
}

const getCurrentCommitHash = async appPath => {
    try {
        const {stdout: commitHash} = await executeCommand('git', ['rev-parse', 'HEAD'], {cwd: appPath})
        return commitHash.trim()
    } catch (err) {
        log.error(`Failed to get current commit hash: ${err.message}`)
        return null
    }
}

const pullUpdates = async (appPath, branch) => {
    try {
        log.info(`Ensuring repository is on branch '${branch}'`)
        await checkoutBranch(appPath, branch)
        
        const {updateAvailable} = await getRepoInfo(appPath)
        
        if (updateAvailable) {
            log.info(`Updates available for ${appPath} → pulling`)
            await executeCommand('git', ['pull', 'origin', branch], {cwd: appPath})
            log.info(`Successfully pulled updates for ${appPath}`)
            return {action: 'updated', success: true}
        }
        log.info(`No updates available for ${appPath}`)
        return {action: 'none', success: true}
    } catch (err) {
        log.error(`Failed to pull updates: ${err.message}`)
        throw new ClientException(`Failed to pull updates: ${err.message}`)
    }
}

module.exports = {
    cloneOrPull,
    getRepoInfo,
    getCurrentCommitHash,
    pullUpdates,
}
