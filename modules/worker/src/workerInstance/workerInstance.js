// WorkerInstance domain object.
//
// Instances are immutable: the mutation helpers (reserve/release) return NEW plain objects.
//
// Shape:
//   id          — unique instance identifier (a uuid locally, an EC2 id like "i-0abc…" on AWS)
//   type        — instance type id (e.g. "T3aSmall")
//   host        — hostname/IP reachable from the sepal cluster
//   running     — boolean — true once the instance is available
//   launchTime  — Date the instance was launched
//   reservation — { username, workerType } or null (null = idle)

// daemonHost — where the Docker Engine API lives, when it is NOT the instance itself.
// Only the local (dev) hosting service sets it: all local instances share the dev
// machine's daemon (host.docker.internal) while `host` becomes a per-instance network
// alias on the `sepal` network. On AWS it stays null and `host` serves both purposes.
const createWorkerInstance = ({id, type, host, running = true, launchTime = new Date(), reservation = null, daemonHost = null}) => ({
    id,
    type,
    host,
    running,
    launchTime,
    reservation,
    daemonHost,
})

const isReserved = instance => instance.reservation != null

const isIdle = instance => !isReserved(instance)

const reserve = (instance, reservation) => ({...instance, reservation})

const release = instance => ({...instance, reservation: null})

export {createWorkerInstance, isIdle, isReserved, release, reserve}
