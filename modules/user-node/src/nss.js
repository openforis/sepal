import {createHash} from 'crypto'

// gecos is free-form (the user's display name); strip the field/line separators that would corrupt
// the colon-delimited passwd format.
const sanitizeGecos = name => (name || '').replace(/[:\n\r]/g, ' ').replace(/\s+/g, ' ').trim()

// One passwd line per identity: name:x:uid:gid:gecos:home:shell. uid/gid are the real POSIX numbers
// (migrated from LDAP, or = id for user-node-created users) — they are not derived from id and the
// two may differ.
const renderPasswd = identities =>
    identities
        .map(({uid, gid, username, name}) => `${username}:x:${uid}:${gid}:${sanitizeGecos(name)}:/home/${username}:/usr/bin/bash`)
        .map(line => `${line}\n`)
        .join('')

// One synthesized per-user primary group per identity: name:x:gid: (no members; no shared groups).
const renderGroup = identities =>
    identities
        .map(({gid, username}) => `${username}:x:${gid}:`)
        .map(line => `${line}\n`)
        .join('')

// Content hash so the sync agent can skip rewrites when nothing changed (returned as an ETag).
const snapshotVersion = (passwd, group) =>
    createHash('sha1').update(passwd).update('\0').update(group).digest('hex')

export {renderGroup, renderPasswd, snapshotVersion}
