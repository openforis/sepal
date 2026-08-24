// task ws — the worker's half of the gateway's virtual-websocket subscription protocol.
//
// One physical connection: the gateway uplink dials ws://worker/ws and multiplexes every GUI
// client over it (see modules/gateway/src/websocket.js MODULE_PROTOCOL).
//   inbound   {event: 'subscriptionUp'|'subscriptionDown', user, clientId, subscriptionId}
//             (other lifecycle events — clientUp/clientDown/userUp/... — are ignored;
//              the gateway emits subscriptionDown for every subscription on client disconnect)
//   outbound  {clientId, subscriptionId, data}  (unicast to one subscriber)
//
// On subscriptionUp the user's FULL task listing is sent; every task mutation (task/events.js)
// triggers a debounced re-query and a push, deduplicated with distinctUntilChanged. The listing
// pipeline is shared per username, so multiple tabs of the same user cost one query per mutation.
// The payload mirrors the user-files ws shape so the GUI feeds it straight into an sTree:
//   data: {path: '', items: {[taskId]: <taskAsListItem>}}
// Flat list for now: every task is a child of the root path ''.

import {catchError, debounceTime, defer, distinctUntilChanged, EMPTY, filter, from, groupBy, map, mergeMap, ReplaySubject, share, startWith, Subject, switchMap, takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'
import {autoRetry} from '#sepal/rxjs'
import {moduleWs$} from '#sepal/ws/module'

import {subscriptionTag, userTag} from '../tag.js'
import {taskChanged$} from './events.js'
import {taskAsListItem} from './tasksApi.js'

const log = getLogger('worker/taskWs')

const DEBOUNCE_MS = 100

// infinite retries by default — a failed listing query must not go silent until the next
// task event; mirrors modules/gateway/src/websocket-uplink.js / modules/user-assets/src/assetManager.js
const DEFAULT_RETRY_CONFIG = {
    maxRetries: -1,
    minRetryDelay: 1000,
    maxRetryDelay: 30000,
    retryDelayFactor: 2
}

const defaultOnRetry = username => (error, retryMessage, retryDelay, retryCount) => {
    const logRetry = retryCount === 1 ? log.warn : log.debug
    logRetry(`Failed to load tasks for user: ${username} - ${retryMessage}`, error.message)
}

const toItems = tasks =>
    tasks.reduce(
        (items, task) => ({...items, [task.id]: taskAsListItem(task)}),
        {}
    )

const createTaskWs = ({taskManager, debounceMilliseconds = DEBOUNCE_MS, retryConfig = {}}) => {
    const protocol = ({send, stop$}) => {
        const subscriptionUp$ = new Subject()
        const subscriptionDown$ = new Subject()

        const currentSubscriptionDown$ = (clientId, subscriptionId) =>
            subscriptionDown$.pipe(
                filter(({clientId: downClientId, subscriptionId: downSubscriptionId}) =>
                    downClientId === clientId && downSubscriptionId === subscriptionId)
            )

        const userTaskItems$ = username =>
            defer(() => from(taskManager.userTasks(username))).pipe(
                map(toItems),
                // retry forever (by default) so a transient failure doesn't go silent until the
                // next task event — this sits under the switchMap below, so a newer change event
                // cancels any in-flight retry loop, which is the intended behaviour
                autoRetry({
                    ...DEFAULT_RETRY_CONFIG,
                    onRetry: defaultOnRetry(username),
                    ...retryConfig
                }),
                catchError(error => {
                    log.error(`Failed to load tasks for ${userTag(username)}`, error)
                    return EMPTY
                })
            )

        // One listing pipeline per username, shared by ALL of that user's subscriptions (browser
        // tabs): a task mutation triggers ONE re-query regardless of how many tabs are open.
        // - ReplaySubject(1) connector: a late subscriber receives the current listing immediately,
        //   preserving the full-state-on-subscribe semantics (including same-subscription resubscribe).
        // - resetOnRefCountZero: when the user's last subscription ends, the pipeline (and its buffer)
        //   is torn down; the next subscriptionUp rebuilds it with a fresh query and fresh dedup state,
        //   so no stale buffer survives an idle period.
        // - Map entries are never deleted: they hold only the shared-observable wrapper (the underlying
        //   pipeline tears down at refcount zero), and the username set per connection is bounded by
        //   active users.
        // distinctUntilChanged suppresses pushes when a re-query yields an identical listing — this
        // relies on taskRepository.userTasks returning rows in a stable order (ORDER BY creation_time);
        // if that ordering were ever lost, the only effect would be redundant pushes (the GUI merge is
        // idempotent), not wrong data.
        const listingByUsername = new Map()

        const userTaskListing$ = username => {
            if (!listingByUsername.has(username)) {
                listingByUsername.set(username,
                    taskChanged$.pipe(
                        filter(({username: changedUsername}) => changedUsername === username),
                        debounceTime(debounceMilliseconds),
                        startWith(null),
                        switchMap(() => userTaskItems$(username)),
                        distinctUntilChanged((previous, current) => JSON.stringify(previous) === JSON.stringify(current)),
                        share({
                            connector: () => new ReplaySubject(1),
                            resetOnError: true,
                            resetOnComplete: true,
                            resetOnRefCountZero: true
                        })
                    )
                )
            }
            return listingByUsername.get(username)
        }

        subscriptionUp$.pipe(
            groupBy(({clientId, subscriptionId}) => `${clientId}:${subscriptionId}`),
            mergeMap(subscription$ => subscription$.pipe(
                switchMap(({username, clientId, subscriptionId}) =>
                    userTaskListing$(username).pipe(
                        map(items => ({clientId, subscriptionId, data: {path: '', items}})),
                        takeUntil(currentSubscriptionDown$(clientId, subscriptionId))
                    )
                )
            )),
            takeUntil(stop$)
        ).subscribe({
            next: ({clientId, subscriptionId, data}) => send({clientId, subscriptionId, data}),
            error: error => log.error('Unexpected subscription stream error', error),
            complete: () => log.debug('Subscription stream complete')
        })

        const EVENT_HANDLERS = {
            subscriptionUp: ({user: {username}, clientId, subscriptionId}) => {
                log.debug(() => `Subscription up: ${subscriptionTag(username, subscriptionId)}`)
                subscriptionUp$.next({username, clientId, subscriptionId})
            },
            subscriptionDown: ({clientId, subscriptionId}) => {
                log.debug(() => `Subscription down: ${subscriptionTag(undefined, subscriptionId)}`)
                subscriptionDown$.next({clientId, subscriptionId})
            }
        }

        return message => {
            const {event, user, clientId, subscriptionId} = message
            if (event) {
                const handler = EVENT_HANDLERS[event]
                if (handler) {
                    handler({user, clientId, subscriptionId})
                } else {
                    log.trace(() => `Ignoring event: ${event}`)
                }
            } else {
                log.warn('Unsupported message:', message)
            }
        }
    }

    return moduleWs$(protocol)
}

export {createTaskWs}
