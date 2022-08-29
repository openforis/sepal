const log = require('sepal/log').getLogger('googleAccessTokenFileGateway')
const Path = require('node:path')
import {mkdir, open, rm, stat} from 'node:fs/promises'

const GoogleAccessTokenFileGateway = homeDirectory => {

    const save = async (username, tokens) => {
        if (!tokens) {
            log.debug(`Removing token file for user ${username}`)
            remove(username)
        } else {
            log.debug(`Saving token file for user ${username} (exipiration: ${tokens.accessTokenExpiryDate})`)
            const {userDirPath, configDirPath, earthEngineDirPath} = getPaths(username)
            
            await mkdir(earthEngineDirPath, {recursive: true})
            const credentialsFilePath = Path.join(earthEngineDirPath, '/credentials')
            const lockFilePath = Path.join(earthEngineDirPath, '/.lock')

            const jsonTokens = JSON.stringify({
                access_token: tokens.accessToken,
                access_token_expiry_date: tokens.accessTokenExpiryDate
            })

            let configDir
            let earthEngineDir
            let lockFile
            let credentialsFile

            try {
                const userDirStat = await stat(userDirPath)
                if (userDirStat) {
                    const {gid} = userDirStat
                    configDir = await open(configDirPath, 'r')
                    earthEngineDir = await open(earthEngineDirPath, 'r')
                    lockFile = await open(lockFilePath, 'w')
                    credentialsFile = await open(credentialsFilePath, 'w')
                    await credentialsFile.write(jsonTokens)
                    await configDir.chown(0, gid)
                    await configDir.chmod(1777)
                    await earthEngineDir.chown(0, gid)
                    await earthEngineDir.chmod(1777)
                    await credentialsFile.chown(0, gid)
                    await credentialsFile.chmod(644)
                    await lockFile.chown(0, gid)
                }
            } finally {
                await configDir?.close()
                await earthEngineDir?.close()
                await credentialsFile?.close()
                await lockFile?.close()
            }
        }
    }

    const remove = async username => {
        log.debug(`Removing token file for user ${username}`)
        const {earthEngineDirPath} = getPaths(username)
        const credentialsFilePath = Path.join(earthEngineDirPath, '/credentials')
        await rm(credentialsFilePath)
    }

    const getPaths = username => {
        const userPath = Path.join(homeDirectory, username)
        const configDirPath = Path.join(userPath, '/.config')
        const earthEngineDirPath = Path.join(configDirPath, '/earthengine')
        return {
            userPath,
            configDirPath,
            earthEngineDirPath
        }
    }

    return {
        save,
        remove
    }
}

module.exports = {GoogleAccessTokenFileGateway}
