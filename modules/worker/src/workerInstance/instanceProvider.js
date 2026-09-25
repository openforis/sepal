// InstanceProvider — the port interface both the local and the AWS provider implement.
// Nothing is exported at runtime; this file documents the contract.
//
//   launchReserved(instanceType, reservation) → Promise<WorkerInstance>
//     Reserved for {username, workerType}, but not necessarily running or addressable yet —
//     the caller must call awaitHost on the result before using its address.
//   launchIdle(instanceType, count)           → Promise<WorkerInstance[]>
//     NOTE: the LOCAL provider IGNORES count and always launches exactly 1.
//   launchPooled(count)                       → Promise<WorkerInstance[]>
//     Warm-up launches for the stopped pool: each reads its whole disk, then stops itself.
//   pool(instanceId)                          → Promise<void>
//     Moves an idle instance into the stopped pool: tagged pooled, then stopped.
//   startPooled(instance, instanceType, reservation) → Promise<WorkerInstance>
//     Starts a ready pooled instance as instanceType, reserved. Like launchReserved, the result has
//     no address yet — the caller must awaitHost. A failed start leaves the instance in the pool.
//   pooledInstances({ready}?)                 → Promise<WorkerInstance[]>
//     Every pool member of the current version (warming, stopping, stopped), unreserved;
//     ready: true → only the stopped ones a request can start.
//     The LOCAL provider has no pool: always [], and the pool writes above reject.
//   terminate(instanceId)                     → Promise<void>
//   attachScratchVolume(instance)             → Promise<string | null>
//     Attaches a blank disk for the session's /tmp to the running instance and resolves its
//     device, or null when the instance has no need for one (local SSDs, local hosting).
//     Idempotent: a provisioning retry reuses the disk already attached.
//   deleteScratchVolume(instanceId)           → Promise<void>
//     Detaches and deletes that disk; its containers must be gone. No-op without one.
//   reserve(instance)                         → Promise<void>
//     The instance already carries the reservation; this persists it.
//   release(instanceId)                       → Promise<void>
//   idleInstances(instanceType?)              → Promise<WorkerInstance[]>
//   reservedInstances()                       → Promise<WorkerInstance[]>
//   getInstance(instanceId)                   → Promise<WorkerInstance | null>
//     NOTE: the AWS provider never resolves null — it throws when it can't find exactly one match.
//   restore(instances)                        → Promise<void> | void
//     Adopt these instances as already existing. Called once at start(), before backfillClaims,
//     with the instances rebuilt from the open sessions. The LOCAL provider needs this to survive
//     a worker restart; AWS implements it as a no-op because EC2 is authoritative.
//   awaitHost(instance)                       → Promise<WorkerInstance>
//     Resolves once the instance has an address; returns it unchanged if it already has one.
//     Required after launchReserved before the instance's address can be used.
//   sweep()                                   → Promise<void>
//     Terminates old idle and untagged instances, pooled instances that are of an old version or
//     never stopped, and stopped instances outside the pool. Called once per pool cycle, never from
//     a read.
//   onInstanceLaunched(listener)              → void   (called asynchronously)
//   start() / stop()                          → background polling; no-ops for local.
//
// WorkerInstance: { id, type, host, running, launchTime, reservation, daemonHost }
//   reservation: { username, workerType, sessionId } | null   (null = idle)
//   daemonHost: set only by the local provider — see workerInstance.js.

export {}
