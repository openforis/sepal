import {renderGroup, renderPasswd, snapshotVersion} from './nss.js'

// uid and gid are the real POSIX numbers (may differ from each other and from id); the NSS lines use
// them, never id.
const ids = [
    {id: 10000, uid: 10000, gid: 10000, username: 'sepaladmin', name: 'Sepal Admin'},
    {id: 10042, uid: 10020, gid: 10031, username: 'alice', name: 'Alice: the Great\nHacker'}
]

test('renderPasswd emits name:x:uid:gid:gecos:/home/name:/usr/bin/bash, gecos sanitized', () => {
    expect(renderPasswd(ids)).toBe(
        'sepaladmin:x:10000:10000:Sepal Admin:/home/sepaladmin:/usr/bin/bash\n' +
        'alice:x:10020:10031:Alice the Great Hacker:/home/alice:/usr/bin/bash\n'
    )
})

test('renderGroup emits one name:x:gid: line per identity', () => {
    expect(renderGroup(ids)).toBe(
        'sepaladmin:x:10000:\n' +
        'alice:x:10031:\n'
    )
})

test('empty identity list renders empty strings', () => {
    expect(renderPasswd([])).toBe('')
    expect(renderGroup([])).toBe('')
})

test('snapshotVersion is stable for the same content and changes when it changes', () => {
    const v1 = snapshotVersion(renderPasswd(ids), renderGroup(ids))
    const v2 = snapshotVersion(renderPasswd(ids), renderGroup(ids))
    const v3 = snapshotVersion(renderPasswd(ids.slice(0, 1)), renderGroup(ids.slice(0, 1)))
    expect(v1).toBe(v2)
    expect(v1).not.toBe(v3)
    expect(v1).toMatch(/^[0-9a-f]{40}$/)
})
