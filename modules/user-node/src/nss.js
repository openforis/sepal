import {createHash} from 'crypto'

// gecos is free-form (the user's display name); strip the field/line separators that would corrupt
// the colon-delimited passwd format.
const sanitizeGecos = name => (name || '').replace(/[:\n\r]/g, ' ').replace(/\s+/g, ' ').trim()

// One passwd line per identity: name:x:uid:gid:gecos:home:shell. uid = gid = sepal_user.id.
const renderPasswd = identities =>
    identities
        .map(({id, username, name}) => `${username}:x:${id}:${id}:${sanitizeGecos(name)}:/home/${username}:/usr/bin/bash`)
        .map(line => `${line}\n`)
        .join('')

// One synthesized per-user primary group per identity: name:x:gid: (no members; no shared groups).
const renderGroup = identities =>
    identities
        .map(({id, username}) => `${username}:x:${id}:`)
        .map(line => `${line}\n`)
        .join('')

// Content hash so the sync agent can skip rewrites when nothing changed (returned as an ETag).
const snapshotVersion = (passwd, group) =>
    createHash('sha1').update(passwd).update('\0').update(group).digest('hex')

export {renderGroup, renderPasswd, snapshotVersion}
