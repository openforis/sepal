// ws.js — the worker's SESSION websocket endpoint (module `worker/session` in the gateway's
// webSocketEndpoints; see modules/gateway/src/websocket.js for the MODULE PROTOCOL).
//
// Pushes the current user's session list to GUI subscribers, replacing two GUI polling loops:
// the 2s `GET /api/sandbox/start` app-launch wait and the 10s `GET /sessions/report` refresh.
//
//   - on subscriptionUp    — full snapshot, unicast to the new subscriber
//   - on sessionChanged$   — re-query, multicast to every tab of that user (subscribed users only)
//   - on {refresh: true}   — fresh snapshot, unicast (the GUI ticks this while the Usage panel is
//                            open, because costSinceCreation / earliestTimeoutHours are derived
//                            from elapsed time and so drift with no event to announce it)
//
// Payload is {sessions} — produced by sessionsApi.userSessions, which serialises each session with
// the SAME builder `GET /sessions/report` uses, so the GUI stores it without translation. The
// report's other half, instanceTypes, is deliberately NOT pushed: it is static config that changes
// only on redeployment, it was 93% of the payload, and the GUI reads it from the REST report when
// the instance picker opens rather than from the store.
//
// Sending the FULL report on every push (rather than deltas) is what makes reconnect self-healing:
// the GUI's ws layer reconnects indefinitely and re-subscribes, which yields a fresh snapshot.
//
// One gateway connection carries every user's subscriptions, so the registry is per-connection
// state inside the protocol closure (moduleWs$ invokes protocol once per connection).

import {debounceTime, groupBy, mergeMap, takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {clientTag, subscriptionTag, userTag} from '../tag.js'

const log = getLogger('worker/sessionWs')

// Collapse bursts (a close cascades app disassociations; a launch activates and associates back to
// back) into one re-query per user.
const DEBOUNCE_MS = 100

const createSessionWsProtocol = ({sessionsApi, sessionChanged$, sessionManager, debounceMilliseconds = DEBOUNCE_MS}) =>
    ({send, stop$}) => {
        // subscriptionId → {username, clientId}
        const subscriptions = new Map()

        const subscribedUsernames = () =>
            new Set([...subscriptions.values()].map(({username}) => username))

        // Unicast to one subscriber (subscriptionUp / refresh).
        const sendSnapshot = async ({username, clientId, subscriptionId}) => {
            try {
                send({clientId, subscriptionId, data: await sessionsApi.userSessions(username)})
            } catch (error) {
                log.error(`Failed to send session snapshot for ${userTag(username)}`, error)
            }
        }

        // Multicast to all of the user's tabs (a change the user did not necessarily trigger).
        const sendUpdate = async username => {
            if (!subscribedUsernames().has(username)) {
                return
            }
            try {
                send({username, data: await sessionsApi.userSessions(username)})
            } catch (error) {
                log.error(`Failed to send session update for ${userTag(username)}`, error)
            }
        }

        const onSubscriptionUp = ({user: {username}, clientId, subscriptionId}) => {
            log.debug(() => `Subscription up: ${subscriptionTag(username, subscriptionId)}`)
            subscriptions.set(subscriptionId, {username, clientId})
            sendSnapshot({username, clientId, subscriptionId})
        }

        const onSubscriptionDown = ({subscriptionId}) => {
            subscriptions.delete(subscriptionId)
        }

        const onClientDown = ({user, clientId}) => {
            for (const [subscriptionId, subscription] of subscriptions) {
                if (subscription.clientId === clientId) {
                    subscriptions.delete(subscriptionId)
                }
            }
            // The client's tabs died with it — dissociate every app it owned (the emitted
            // SessionAppDissociated events refresh reports; no takeover notifications, the
            // requester IS the downed owner).
            if (sessionManager && user?.username) {
                sessionManager.dissociateAppsForClient({username: user.username, clientId})
                    .catch(error => log.error(`Failed to dissociate apps of ${clientTag(clientId)}`, error))
            }
        }

        const onUserDown = ({user: {username}}) => {
            for (const [subscriptionId, subscription] of subscriptions) {
                if (subscription.username === username) {
                    subscriptions.delete(subscriptionId)
                }
            }
        }

        const EVENT_HANDLERS = {
            subscriptionUp: onSubscriptionUp,
            subscriptionDown: onSubscriptionDown,
            clientDown: onClientDown,
            userDown: onUserDown,
        }

        // groupBy(username) so the debounce is PER USER — one busy user must not delay another's
        // push, which a single debounceTime on the shared stream would do.
        sessionChanged$.pipe(
            groupBy(({username}) => username),
            mergeMap(user$ => user$.pipe(debounceTime(debounceMilliseconds))),
            takeUntil(stop$)
        ).subscribe({
            next: ({username}) => sendUpdate(username),
            error: error => log.error('Unexpected sessionChanged$ stream error', error),
        })

        return message => {
            const {event, user, data, clientId, subscriptionId} = message
            if (event) {
                const handler = EVENT_HANDLERS[event]
                if (handler) {
                    handler({user, clientId, subscriptionId})
                } else {
                    log.trace(() => `Ignoring event: ${event}`)
                }
            } else if (data) {
                if (data.refresh) {
                    sendSnapshot({username: user.username, clientId, subscriptionId})
                } else {
                    log.warn('Unsupported message data:', data)
                }
            } else {
                log.warn('Unsupported message:', message)
            }
        }
    }

const createSessionWs = ({sessionsApi, sessionChanged$, sessionManager}) =>
    moduleWs$(createSessionWsProtocol({sessionsApi, sessionChanged$, sessionManager}))

export {createSessionWs, createSessionWsProtocol}
