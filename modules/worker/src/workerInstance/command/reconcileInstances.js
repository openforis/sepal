// ReconcileInstances — make the `instance` table agree with the hosting service, which is the
// only real source of truth about what exists.
//
// Two ways they drift, and only one of them hurts:
//
//   provider idle, no row  → RequestInstance reserves an instance only when it is idle in BOTH
//                            sources, so the instance can never be handed to a session; and
//                            SizeIdlePool counts the provider ALONE, so it counts towards the
//                            target and no usable replacement is launched. Every request of that
//                            type then launches a fresh instance while the orphan sits idle and
//                            bills forever. On AWS this is reachable whenever the repo write is
//                            lost after the provider write landed — e.g. launchIdle tags its
//                            batch one instance at a time and terminates-and-throws on a tag
//                            failure, so instances tagged State=idle earlier in that batch never
//                            reach repo.launched.
//   row, no provider       → harmless to RequestInstance (the intersection drops it) but the rows
//                            accumulate without bound.
//
// Reserved instances are deliberately NOT adopted: their reservation is the session layer's to
// own. They are passed in only to keep `forgotten` from dropping a reserved instance's row when
// the provider reports it as reserved rather than idle.

import {getLogger} from '#sepal/log'

const log = getLogger('worker/reconcileInstances')

const reconcileInstances = async ({repo, provider}) => {
    const [idle, reserved] = await Promise.all([
        provider.idleInstances(),
        provider.reservedInstances(),
    ])

    const adopted = await repo.reconciled(idle)
    const forgotten = await repo.forgotten([...idle, ...reserved].map(({id}) => id))

    if (adopted > 0) {
        log.info(`Adopted ${adopted} idle instance(s) the repository had never seen`)
    }
    if (forgotten > 0) {
        log.info(`Forgot ${forgotten} idle instance(s) the hosting service no longer has`)
    }
    return {adopted, forgotten}
}

export {reconcileInstances}
