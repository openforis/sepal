// Creates folders as a user, run by createFolders (homeWrite.js) in a process started with the user's uid and gid.
// Arguments: the uid, gid and supplementary groups (comma-separated) it must have, then the folders, each in the one
// before. Changes nothing unless it has exactly that identity, never root's. Exits 0 once the final folder is created:
// a parent already there is accepted only as the user's directory, and one created gets the user's group and mode
// 0755, whatever its parent passes on. Otherwise prints the code of what stopped it and exits 1.
import {constants} from 'node:fs'
import {lstat, mkdir, open} from 'node:fs/promises'

const [uid, gid] = process.argv.slice(2, 4).map(Number)
const groups = process.argv[4].split(',').map(Number)
const folders = process.argv.slice(5)

const main = async () => {
    if (!hasIdentity()) {
        throw failure('EIDENTITY')
    }
    for (const folder of folders) {
        await ensureFolder(folder)
    }
}

// Root is never a folder's owner here, whatever owns the home.
const hasIdentity = () =>
    uid !== 0
    && [process.getuid(), process.geteuid()].every(id => id === uid)
    && [process.getgid(), process.getegid()].every(id => id === gid)
    && sorted(process.getgroups()).join() === sorted(groups).join()

const ensureFolder = async folder => {
    if (await created(folder)) {
        await finish(folder)
    } else {
        checkExisting(await lstat(folder))
        if (folder === folders.at(-1)) {
            throw failure('EEXIST')
        }
    }
}

const created = folder =>
    mkdir(folder, 0o755).then(() => true, error => {
        if (error.code === 'EEXIST') {
            return false
        }
        throw error
    })

// Through the folder's handle, after checking it is still the one this process made.
const finish = async folder => {
    const handle = await open(folder, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
        if ((await handle.stat()).uid !== uid) {
            throw failure('EREFUSED')
        }
        await handle.chown(uid, gid)
        await handle.chmod(0o755)
    } finally {
        await handle.close()
    }
}

const checkExisting = stats => {
    if (stats.isSymbolicLink() || !stats.isDirectory() || stats.uid !== uid) {
        throw failure('EREFUSED')
    }
}

const sorted = ids =>
    [...ids].sort((a, b) => a - b)

const failure = code =>
    Object.assign(new Error(code), {code})

try {
    await main()
} catch (error) {
    process.stdout.write(error.code ?? 'EFAILED')
    process.exitCode = 1
}
