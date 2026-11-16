import {lstat, readlink, realpath, rm} from 'node:fs/promises'
import Path from 'node:path'

import {Observable} from 'rxjs'

// Error codes of a path that does not lead to anything within the home.
export const UNRESOLVABLE = ['ENOENT', 'ENOTDIR', 'ELOOP', 'EOUTSIDEHOME']

// How many entries one listing describes at a time, at most. Each listing has its own allowance, so that a large
// directory leaves the file system threads to others' listings too; listings at the same time add up.
export const ENTRY_CONCURRENCY = 16

// As many links as Linux follows resolving a path.
const MAX_LINKS = 40

// Where sandboxes and tasks show the user's home (modules/worker/src/workerInstance/workerTypes.js,
// modules/task-manager/src/containerSpec.js), and the names in it where a sandbox mounts other storage instead.
const SANDBOX_HOME_NAMES = ['home', 'sepal-user']
const SANDBOX_MOUNTS = ['shared', 'tmp']

// Where a path in a home leads, following its links within the home. A client's path is taken lexically, as clients
// name paths. Links are then followed one name at a time, as the kernel would follow them, but nothing outside the
// home is ever looked up: a `..` leading above the home is refused before anything there is touched, even when the
// rest of the path would lead back. What lies outside therefore never shapes the answer. The path returned contains
// no links, so through the deployed nosymfollow view, a part of it replaced by a link before it is used fails rather
// than being followed.
export const resolvePath = async (homeDir, path) => {
    const home = await realpath(homeDir)
    return walk(home, home, requestedNames(path), {links: 0, linked: 0})
}

// What an entry in a home is: a link is described as what it leads to, or, when unusable, as itself with its problem,
// and names the target it stores either way. Expects the home and the entry's directory resolved.
export const describeEntry = async (home, path) => {
    const stats = await lstat(path)
    return stats.isSymbolicLink()
        ? describeLink(home, path, stats)
        : {stats, link: {}}
}

// The entries of a directory as `describe` makes them from their names, leaving out those it makes nothing of, as one
// array. ENTRY_CONCURRENCY lanes each take the next name left once their last is described, so a description starts
// only as another ends, and none starts once the listing is unsubscribed; one already started ends unseen. Lanes
// rather than a mergeMap with a limit, which buffers every name and shifts that buffer for each one started: quadratic
// in the size of the directory.
export const describeEntries$ = (names, describe) =>
    new Observable(subscriber => {
        const remaining = names.values()
        const described = []
        const lane = async () => {
            for (const name of remaining) {
                if (subscriber.closed) {
                    return
                }
                const entry = await describe(name)
                if (entry) {
                    described.push(entry)
                }
            }
        }
        Promise.all(Array.from({length: ENTRY_CONCURRENCY}, lane)).then(
            () => {
                subscriber.next(described)
                subscriber.complete()
            },
            error => subscriber.error(error)
        )
    })

// Only the parent is resolved, so a link is removed itself instead of what it leads to.
export const removeUserPath = async (userHomeDir, path) => {
    const parent = await resolvePath(userHomeDir, Path.dirname(path))
    const name = Path.basename(path)
    if (['', '.', '..'].includes(name)) {
        throw new Error(`Refusing to remove path outside home: ${path}`)
    }
    await rm(Path.join(parent, name), {recursive: true})
}

// Whether a path is the home or within it, by its name alone.
export const isWithin = (home, path) => {
    const relative = Path.relative(home, path)
    return !(relative === '..' || relative.startsWith(`..${Path.sep}`) || Path.isAbsolute(relative))
}

// A client's path, taken lexically: what remains of a `..` leads above the home, which the walk refuses.
const requestedNames = path =>
    Path.join('.', path).split(Path.sep)

const describeLink = async (home, path, linkStats) => {
    const symlinkTarget = await readlink(path)
    try {
        const {start, names} = targetStart(home, Path.dirname(path), symlinkTarget)
        const resolved = await walk(home, start, names, {links: 1, linked: names.length})
        return {stats: await lstat(resolved), link: {symlinkTarget}}
    } catch (error) {
        return {stats: linkStats, link: {symlinkTarget, symlinkProblem: LINK_PROBLEMS[error.code] || 'inaccessible-target'}}
    }
}

// Follows names from a directory within the home, which is the only place each next name is looked up. Counts the
// links followed, and how many of the names ahead come from link targets: those are written in a sandbox, so they
// never step from the home into what a sandbox mounts there, whatever the home itself holds under that name.
const walk = async (home, directory, [name, ...rest], {links, linked}) => {
    if (links > MAX_LINKS) {
        throw failure('ELOOP', 'Too many links')
    }
    const next = {links, linked: Math.max(linked - 1, 0)}
    if (name === undefined) {
        return directory
    }
    if (name === '' || name === '.') {
        return walk(home, directory, rest, next)
    }
    if (name === '..') {
        return walk(home, parentWithin(home, directory), rest, next)
    }
    if (linked && directory === home && SANDBOX_MOUNTS.includes(name)) {
        throw outsideHome()
    }
    const path = Path.join(directory, name)
    const stats = await lstat(path)
    if (stats.isSymbolicLink()) {
        const target = targetStart(home, directory, await readlink(path))
        return walk(home, target.start, [...target.names, ...rest], {links: links + 1, linked: target.names.length + next.linked})
    }
    if (rest.length && !stats.isDirectory()) {
        throw failure('ENOTDIR', 'Not a directory')
    }
    return walk(home, path, rest, next)
}

// Where a link's target starts, and the names it takes from there: a relative target from the link's directory, an
// absolute one from the home, when it names the home as this service or a sandbox shows it. Names past the home are
// left as they are for the walk, so that nothing above the home is looked up.
const targetStart = (home, directory, target) => {
    const names = target.split(Path.sep)
    if (!Path.isAbsolute(target)) {
        return {start: directory, names}
    }
    const homeNames = pastHome(home.split(Path.sep).filter(Boolean), names) ?? pastHome(SANDBOX_HOME_NAMES, names)
    if (!homeNames) {
        throw outsideHome()
    }
    return {start: home, names: homeNames}
}

// The names of an absolute target past the home it names, left as they are for the walk; none when it names anywhere
// else. Up to the home, empty and `.` names are skipped as the kernel skips them, and any other name must be the
// home's next: a `..` there would step above the home.
const pastHome = ([homeName, ...homeRest], names) => {
    if (homeName === undefined) {
        return names
    }
    const [name, ...rest] = names
    if (name === '' || name === '.') {
        return pastHome([homeName, ...homeRest], rest)
    }
    return name === homeName ? pastHome(homeRest, rest) : null
}

const parentWithin = (home, directory) => {
    if (directory === home) {
        throw outsideHome()
    }
    return Path.dirname(directory)
}

const failure = (code, message) =>
    Object.assign(new Error(message), {code})

const outsideHome = () =>
    failure('EOUTSIDEHOME', 'Path leads out of the home')

const LINK_PROBLEMS = {
    ENOENT: 'missing-target',
    ENOTDIR: 'missing-target',
    ELOOP: 'link-loop',
    EOUTSIDEHOME: 'outside-home'
}
