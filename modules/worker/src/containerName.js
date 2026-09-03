// containerName — the one formula naming a worker's container: "{image}.{username}.{instanceName}".
//
// Three call sites need it and none of them can see the others: the provisioner creates the
// container, dockerSandboxServerControl starts a server inside it, dockerInstanceStats reads its
// stats. A container is addressed by name alone, so any drift between them is invisible until a
// lookup silently finds nothing.
//
// The last segment is the two-word name the user already reads for the instance (instanceName),
// not a second identifier: what a notification calls "fancy-aspen" is `sandbox.alice.fancy-aspen`
// on the daemon. Since it derives from the session id, an instance reused by a later session gets
// a new container name — which is correct, the container is rebuilt per session.

import {instanceName} from './instanceName.js'

const containerName = ({image, username, sessionId}) => {
    const name = instanceName(sessionId)
    if (!name) {
        throw new Error(`Cannot name a ${image} container without a session id`)
    }
    return `${image}.${username}.${name}`
}

export {containerName}
