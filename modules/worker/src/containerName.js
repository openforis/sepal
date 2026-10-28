// containerName — the one formula naming a worker's container:
// "{image}.{username}.{instanceName}.{instanceId}".
//
// Three call sites need it and none of them can see the others: the provisioner creates the
// container, dockerSandboxServerControl starts a server inside it, dockerInstanceStats reads its
// stats. A container is addressed by name alone, so any drift between them is invisible until a
// lookup silently finds nothing.
//
// The third segment is the two-word name the user already reads for the instance (instanceName):
// what a notification calls "fancy-aspen" is `sandbox.alice.fancy-aspen.i-0abc123` on the daemon.
// Since it derives from the session id, an instance reused by a later session gets a new container
// name — which is correct, the container is rebuilt per session.
//
// The last segment is the instance id, and it is what makes the container FINDABLE. On a shared
// daemon both ownership lookups ask "which containers belong to instance X" — the pre-create
// cleanup, which has to clear anything still holding the instance's network alias, and the orphan
// sweep — and a name is all Docker gives them to answer with.

import {instanceName} from './instanceName.js'

const containerName = ({image, username, sessionId, instanceId}) => {
    const name = instanceName(sessionId)
    if (!name) {
        throw new Error(`Cannot name a ${image} container without a session id`)
    }
    if (!instanceId) {
        throw new Error(`Cannot name a ${image} container without an instance id`)
    }
    return `${image}.${username}.${name}.${instanceId}`
}

export {containerName}
