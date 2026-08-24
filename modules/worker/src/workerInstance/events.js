// workerInstance events.
//
// Each event is published to BOTH:
//   1. the sepal.topic RabbitMQ exchange (via an RxJS Subject → publisher stream wired in main.js)
//   2. an in-proc Node.js EventEmitter (so same-process listeners react without a round-trip)
//
// Routing keys: workerInstance.{EventName}
//
// Payloads:
//   InstanceLaunched              { instance }
//   InstancePendingProvisioning   { instance }
//   InstanceProvisioned           { instance }
//   InstanceReleased              { instance }
//   FailedToProvisionInstance     { instance, error }
//   FailedToReleaseInstance       { instanceId, error }
//   FailedToRequestInstance       { workerType, instanceType, exception }

import EventEmitter from 'events'
import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'

import {instanceTag} from '../tag.js'

const log = getLogger('worker/events')

// ─── In-proc EventEmitter ────────────────────────────────────────────────────
// Used by InstanceManager to react to events without a RabbitMQ round-trip.
const instanceEvents = new EventEmitter()
instanceEvents.setMaxListeners(50)

// ─── RxJS Subjects (→ sepal.topic publishers) ────────────────────────────────
const instanceLaunched$ = new Subject()
const instancePendingProvisioning$ = new Subject()
const instanceProvisioned$ = new Subject()
const instanceReleased$ = new Subject()
const failedToProvisionInstance$ = new Subject()
const failedToReleaseInstance$ = new Subject()
const failedToRequestInstance$ = new Subject()

// ─── Emit helpers ────────────────────────────────────────────────────────────
// Each helper publishes to the Subject (→ RabbitMQ) AND fires the in-proc emitter.

const emitInstanceLaunched = instance => {
    const payload = {instance}
    log.debug(`Emitting InstanceLaunched ${instanceTag(instance)}`)
    instanceLaunched$.next(payload)
    // InstanceLaunched has no in-proc listener.
}

const emitInstancePendingProvisioning = instance => {
    const payload = {instance}
    log.debug(`Emitting InstancePendingProvisioning ${instanceTag(instance)}`)
    instancePendingProvisioning$.next(payload)
    instanceEvents.emit('InstancePendingProvisioning', instance)
}

const emitInstanceProvisioned = instance => {
    const payload = {instance}
    log.debug(`Emitting InstanceProvisioned ${instanceTag(instance)}`)
    instanceProvisioned$.next(payload)
    instanceEvents.emit('InstanceProvisioned', instance)
}

const emitInstanceReleased = instance => {
    const payload = {instance}
    log.debug(`Emitting InstanceReleased ${instanceTag(instance)}`)
    instanceReleased$.next(payload)
}

const emitFailedToProvisionInstance = (instance, error) => {
    const payload = {instance, error: error?.message ?? String(error)}
    log.warn(`Emitting FailedToProvisionInstance ${instanceTag(instance)}: ${error?.message}`)
    failedToProvisionInstance$.next(payload)
    instanceEvents.emit('FailedToProvisionInstance', instance, error)
}

const emitFailedToReleaseInstance = (instanceId, error) => {
    const payload = {instanceId, error: error?.message ?? String(error)}
    log.warn(`Emitting FailedToReleaseInstance ${instanceTag(instanceId)}: ${error?.message}`)
    failedToReleaseInstance$.next(payload)
}

const emitFailedToRequestInstance = (workerType, instanceType, exception) => {
    const payload = {workerType, instanceType, exception: exception?.message ?? String(exception)}
    log.warn(`Emitting FailedToRequestInstance ${workerType}/${instanceType}: ${exception?.message}`)
    failedToRequestInstance$.next(payload)
}

// ─── Publisher map for initMessageQueue ──────────────────────────────────────
// Caller (main.js / index.js) spreads this into the publishers array.
const WORKER_INSTANCE_PUBLISHERS = [
    {key: 'workerInstance.InstanceLaunched', publish$: instanceLaunched$},
    {key: 'workerInstance.InstancePendingProvisioning', publish$: instancePendingProvisioning$},
    {key: 'workerInstance.InstanceProvisioned', publish$: instanceProvisioned$},
    {key: 'workerInstance.InstanceReleased', publish$: instanceReleased$},
    {key: 'workerInstance.FailedToProvisionInstance', publish$: failedToProvisionInstance$},
    {key: 'workerInstance.FailedToReleaseInstance', publish$: failedToReleaseInstance$},
    {key: 'workerInstance.FailedToRequestInstance', publish$: failedToRequestInstance$},
]

export {
    emitFailedToProvisionInstance,
    emitFailedToReleaseInstance,
    emitFailedToRequestInstance,
    emitInstanceLaunched,
    emitInstancePendingProvisioning,
    emitInstanceProvisioned,
    emitInstanceReleased,
    failedToProvisionInstance$,
    failedToReleaseInstance$,
    failedToRequestInstance$,
    instanceEvents,
    instanceLaunched$,
    instancePendingProvisioning$,
    instanceProvisioned$,
    instanceReleased$,
    WORKER_INSTANCE_PUBLISHERS,
}
