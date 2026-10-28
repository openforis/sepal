// instanceFromSession — rebuild the full WorkerInstance from a session row.
//
// A session persists only the {id, host} projection, but the provisioner needs the type and the
// whole reservation: the container name derives from reservation.sessionId. launchTime comes
// from the session's creation time, which is what releaseUnusedInstances ages against and what
// sizeIdlePool sorts by — defaulting it to now would make a rebuilt instance look permanently
// too young to release.
//
// daemonHost is deliberately left null: only the local provisioner needs one, and its
// normalizeInstance fills in the shared dev daemon.

import {createWorkerInstance} from './workerInstance.js'

const instanceFromSession = session => createWorkerInstance({
    id: session.instance.id,
    type: session.instanceType,
    host: session.instance.host,
    running: true,
    launchTime: session.creationTime ?? new Date(),
    reservation: {
        username: session.username,
        workerType: session.workerType,
        sessionId: session.id,
    },
})

export {instanceFromSession}
