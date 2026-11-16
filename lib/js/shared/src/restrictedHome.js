import {readFile} from 'node:fs/promises'
import Path from 'node:path'

export const requireRestrictedHome = async homeDir => {
    if (process.env.DEPLOY_ENVIRONMENT === 'DEV') {
        return
    }
    const mountInfo = await readFile('/proc/self/mountinfo', 'utf8')
    if (!isRestrictedHomeMount({homeDir, mountInfo})) {
        throw new Error(`Refusing to start: ${homeDir} requires a nosymfollow mount outside DEPLOY_ENVIRONMENT=DEV`)
    }
}

export const isRestrictedHomeMount = ({homeDir, mountInfo}) => {
    const home = Path.resolve(homeDir)
    let deepest = -1
    let restricted = false
    for (const line of mountInfo.split('\n')) {
        const fields = line.split(' ')
        if (fields.length < 10 || fields.indexOf('-') < 6) {
            continue
        }
        const mountPoint = fields[4].replace(/\\([0-7]{3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)))
        if (home !== mountPoint && !home.startsWith(mountPoint === '/' ? '/' : `${mountPoint}/`)) {
            continue
        }
        const hasFlag = fields[5].split(',').includes('nosymfollow')
        if (mountPoint.length > deepest) {
            deepest = mountPoint.length
            restricted = hasFlag
        } else if (mountPoint.length === deepest) {
            restricted &&= hasFlag
        }
    }
    return restricted
}
