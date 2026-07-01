import fs from 'fs/promises'

import {getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

const log = getLogger('nss-sync')

const USER_NODE_URL = process.env.USER_NODE_URL || 'http://user-node'
const AMQP_URI = process.env.AMQP_URI || `amqp://${process.env.RABBITMQ_HOST || 'rabbitmq'}`
const INTERVAL_MS = Number(process.env.NSS_SYNC_INTERVAL_MS || 60000)
const DIR = '/var/lib/extrausers'
const PASSWD = `${DIR}/passwd`
const GROUP = `${DIR}/group`

let etag = null

// Write atomically: write a unique temp file in the same dir, then rename over the target (atomic on
// the same filesystem). chmod after rename so the mode is 0644 regardless of the process umask.
const writeAtomic = async (file, content) => {
    const tmp = `${file}.tmp.${process.pid}`
    await fs.writeFile(tmp, content, {mode: 0o644})
    await fs.rename(tmp, file)
    await fs.chmod(file, 0o644)
}

const sync = async () => {
    const res = await fetch(`${USER_NODE_URL}/nss/snapshot`, etag ? {headers: {'If-None-Match': etag}} : {})
    if (res.status === 304) {
        return
    }
    if (!res.ok) {
        throw new Error(`snapshot request failed: ${res.status}`)
    }
    const {passwd, group, version} = await res.json()
    if (typeof passwd !== 'string' || typeof group !== 'string') {
        throw new Error('malformed snapshot')
    }
    await writeAtomic(PASSWD, passwd)
    await writeAtomic(GROUP, group)
    etag = res.headers.get('etag') || version
    log.info(`NSS synced: ${passwd.split('\n').filter(Boolean).length} identities (version ${String(version).slice(0, 12)})`)
}

// Serialize syncs: the periodic timer and the user.UserUpdated trigger can fire concurrently, and
// they write the same files — skip if one is already in flight (the next trigger/interval re-syncs).
let syncing = false
const safeSync = async () => {
    if (syncing) {
        return
    }
    syncing = true
    try {
        await sync()
    } catch (error) {
        log.warn(`NSS sync failed (will retry): ${error.message}`)
    } finally {
        syncing = false
    }
}

const main = async () => {
    await fs.mkdir(DIR, {recursive: true})
    await safeSync()
    setInterval(safeSync, INTERVAL_MS)
    await initMessageQueue(AMQP_URI, {
        subscribers: [
            {queue: 'ssh-gateway.userUpdated', topic: 'user.UserUpdated', handler: async () => { await safeSync() }}
        ]
    })
    log.info('NSS sync agent started')
}

main().catch(error => {
    log.fatal('NSS sync agent failed to start', error)
    process.exit(1)
})
