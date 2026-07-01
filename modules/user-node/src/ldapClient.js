import {Client} from 'ldapts'

import {getLogger} from '#sepal/log'

const log = getLogger('ldapClient')

const PEOPLE_FILTER = '(objectClass=posixAccount)'

// Reads users from LDAP for migration. Caller provides connection settings; userPassword is
// requested as a Buffer so binary-safe decoding is possible. uidNumber and the entry's gidNumber
// (the user's per-user primary group) are read and stored verbatim — on-disk files are owned by
// these numbers, which are NOT equal to sepal_user.id (independent ldapscripts sequences).
const createLdapClient = ({host, bindDn, password, baseDn}) => {
    const client = new Client({url: `ldap://${host}`})

    const connect = async () => {
        await client.bind(bindDn, password)
        log.info(`Bound to ldap://${host} as ${bindDn}`)
    }

    const disconnect = async () => {
        await client.unbind()
    }

    const searchUsers = async () => {
        const {searchEntries} = await client.search(`ou=People,${baseDn}`, {
            scope: 'sub',
            filter: PEOPLE_FILTER,
            attributes: ['uid', 'uidNumber', 'gidNumber', 'userPassword', 'sshPublicKey'],
            explicitBufferAttributes: ['userPassword']
        })
        return searchEntries.map(entry => ({
            username: entry.uid,
            uid: parseInt(entry.uidNumber, 10),
            gid: parseInt(entry.gidNumber, 10),
            passwordValue: entry.userPassword,
            sshPublicKey: entry.sshPublicKey || null
        }))
    }

    return {connect, disconnect, searchUsers}
}

export {createLdapClient}
