// InstanceProvider — the port interface both the local and the AWS provider implement.
// Nothing is exported at runtime; this file documents the contract.
//
//   launchReserved(instanceType, reservation) → Promise<WorkerInstance>
//     A running instance already reserved for {username, workerType}.
//   launchIdle(instanceType, count)           → Promise<WorkerInstance[]>
//     NOTE: the LOCAL provider IGNORES count and always launches exactly 1.
//   terminate(instanceId)                     → Promise<void>
//   reserve(instance)                         → Promise<void>
//     The instance already carries the reservation; this persists it.
//   release(instanceId)                       → Promise<void>
//   idleInstances(instanceType?)              → Promise<WorkerInstance[]>
//   reservedInstances()                       → Promise<WorkerInstance[]>
//   getInstance(instanceId)                   → Promise<WorkerInstance | null>
//   onInstanceLaunched(listener)              → void   (called asynchronously)
//   start() / stop()                          → background polling; no-ops for local.
//
// WorkerInstance: { id, type, host, running, launchTime, reservation }
//   reservation: { username, workerType } | null   (null = idle)

export {}
