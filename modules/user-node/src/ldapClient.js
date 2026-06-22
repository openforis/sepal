import {Client} from 'ldapts'

import {getLogger} from '#sepal/log'

const log = getLogger('ldapClient')

const PEOPLE_FILTER = '(objectClass=posixAccount)'

// Reads users from LDAP for migration. Caller provides connection settings; userPassword is
// requested as a Buffer so binary-safe decoding is possible. uidNumber is read only to assert it
// equals the DB id (uid = gid = id); it is not stored.
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
            attributes: ['uid', 'uidNumber', 'userPassword', 'sshPublicKey'],
            explicitBufferAttributes: ['userPassword']
        })
        return searchEntries.map(entry => ({
            username: entry.uid,
            uid: parseInt(entry.uidNumber, 10),
            passwordValue: entry.userPassword,
            sshPublicKey: entry.sshPublicKey || null
        }))
    }

    return {connect, disconnect, searchUsers}
}

export {createLdapClient}
