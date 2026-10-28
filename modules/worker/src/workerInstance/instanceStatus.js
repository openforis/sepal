// InstanceStatus — the verdict of a liveness probe against a worker instance.
//
//   PROVISIONED — Docker answered and the instance's containers are running.
//   MISSING     — Docker answered and DENIED the containers (404, or not running). Definitive.
//   UNKNOWN     — the probe could not reach a verdict (connection refused, timeout, 5xx, DNS).
//
// The distinction matters because closing a session is destructive and asymmetric: a false MISSING
// kills a live user session and, one ReleaseUnusedInstances sweep later, terminates its machine,
// while a false PROVISIONED costs one extra minute of a dead instance. Only definitive evidence
// may close a session; UNKNOWN is handled by a long backstop instead (see missingInstanceTracker).
const InstanceStatus = Object.freeze({
    PROVISIONED: 'PROVISIONED',
    MISSING: 'MISSING',
    UNKNOWN: 'UNKNOWN',
})

export {InstanceStatus}
