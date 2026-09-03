import {execFile} from 'child_process'
import {promisify} from 'util'

const PROVISION = '/usr/local/bin/provision-user'

// `exec(cmd, args) -> {stdout, stderr}`. Injectable so the arg construction can be unit-tested.
const createProvisioning = exec => ({
    // Create the user's SSH home (+ keypair) and SEPAL data home, owned by uid:gid; returns the SSH
    // public key. uid/gid are the real POSIX numbers (migrated, or = id for new users), not derived.
    provision: async (username, uid, gid) => {
        const {stdout} = await exec('sudo', [PROVISION, username, String(uid), String(gid)])
        return stdout.trim()
    }
})

const execFileAsync = promisify(execFile)
const defaultExec = (cmd, args) => execFileAsync(cmd, args)

const {provision} = createProvisioning(defaultExec)

export {createProvisioning, provision}
