// WorkerSession repository — persists worker session lifecycle to the `worker`.`worker_session`
// table.
//
// createWorkerSessionRepository(pool?, clock?, sessionAppRepo?) — injectable factory.
//   pool           — if omitted, falls back to the module-level getPool() (shared worker pool).
//   clock          — () => Date; used for update_time (update) and now (timedOutSessions).
//                    Defaults to () => new Date(), injectable so tests can pin time.
//   sessionAppRepo — the session_app cascade repo. Defaults to a lazily-constructed
//                    createSessionAppRepository(pool, clock).
//
// Methods:
//   insert(session)                                 INSERT (12 columns incl api_key + timeout_time)
//   update(session)                                 UPDATE state/update_time — TWO variants
//                                                    (CLOSED nulls api_key); CLOSED also cascades
//                                                    sessionAppRepo.deleteForSession
//   activateSession(sessionId, leaseMinutes)        guarded PENDING → ACTIVE; stamps active_time
//                                                    and re-ratchets the startup lease
//   getSession(id)                                  SELECT one; THROWS if missing
//   userSessions(username, states?, workerType?, instanceType?)  dynamic WHERE
//   sessions(states)                                SELECT WHERE state IN (...)
//   timedOutSessions()                              PENDING rows older than Timeout.PENDING
//   sessionOnInstance(instanceId, states)           SELECT one or null
//   findUsernameByApiKey(apiKey)                    username (lowercased) or null; PENDING/ACTIVE only
//   mostRecentlyClosedSessionByUser()               Map<username, Date>
//   mostRecentlyClosedSession(username)             { timestamp: Date } or {}
//   allOpenSessions()                               every PENDING+ACTIVE session, ALL users, as
//                                                    [{username, sessionId, instanceType, creationTime}]
//
// Expiration (docs/session-expiration-model.md) — every one of these is a compare-and-set, and the
// sweep never acts on a fact it read earlier:
//   extendSession({sessionId, minutes, interaction, capHours})   THE ratchet — how a deadline
//                                                    moves for every AUTOMATIC signal. Monotonic
//                                                    (GREATEST), single clock (NOW()), and atomic
//                                                    with the notification reset.
//   setSessionTimeout({sessionId, minutes})         the keep-alive slider — REPLACES the deadline,
//                                                    the one write that may also shorten it
//   expiredSessions()                               ACTIVE, past deadline, no PENDING/ACTIVE task
//   notifyExpiry(sessionId)                         NONE → NOTIFIED (guarded)
//   markEmailed(sessionId, notifiedTime)            NOTIFIED → EMAILED (guarded)
//   dismissNotification(sessionId, username)        NOTIFIED → DISMISSED (guarded)
//   redeemExtension({sessionId, notifiedTime, minutes})  the email link's single-use extension
//   restartExpiryCycle(sessionId, notifiedTime, minutes)  notify-mode reset → NONE
//   closeExpiredSession({...})                      the guarded close (re-asserts every decision)
//
// Rows are reconstructed into WorkerSession domain objects, mapping instance_id/host →
// instance{id,host} (username lowercased).

import {getLogger} from '#sepal/log'

import {getPool} from '../db.js'
import {sessionTag} from '../tag.js'
import {createSessionAppRepository} from './sessionAppRepository.js'
import {createWorkerSession, NotificationState, State, Timeout} from './workerSession.js'

// `worker/expiry` is the lifecycle NARRATIVE, deliberately its own category rather than this
// file's: the same switch turns on the signal (pty advance, busy verdict), the ratchet it produced,
// and the deadline that resulted — across the repository and the sampler. Turning it to debug is
// how rollout step 2 is observed, so keep the two ends on one logger name.
const log = getLogger('worker/expiry')

const {PENDING, ACTIVE, CLOSED} = State

const placeholders = count => Array(count).fill('?').join(', ')

const toDate = value => value ? new Date(value) : null

const SESSION_COLUMNS = `id, state, username, worker_type, instance_type, instance_id, host,
    creation_time, update_time, api_key, timeout_time, last_interaction_time, active_time,
    notification_state, notified_time`

// unattendedAnchor — the cap's anchor (§2). COALESCE, because last_interaction_time is NULL until
// the first human event and two paths reach a busy verdict without one (a task-executor session,
// and a sandbox session whose job starts before any app or terminal is opened). `now − NULL` is
// NULL in SQL, which would make the comparison false and the busy ratchet UNBOUNDED — the opposite
// of the intent, in precisely the cases the cap exists for. creation_time is the never-NULL
// backstop.
const UNATTENDED_ANCHOR = 'COALESCE(last_interaction_time, active_time, creation_time)'

// toSession — maps instance_id/host → instance{id,host}; username lowercased.
const toSession = row => createWorkerSession({
    id: row.id,
    state: row.state,
    username: row.username ? row.username.toLowerCase() : row.username,
    workerType: row.worker_type,
    instanceType: row.instance_type,
    instance: {id: row.instance_id, host: row.host},
    creationTime: toDate(row.creation_time),
    updateTime: toDate(row.update_time),
    apiKey: row.api_key,
    timeoutTime: toDate(row.timeout_time),
    lastInteractionTime: toDate(row.last_interaction_time),
    activeTime: toDate(row.active_time),
    notificationState: row.notification_state ?? NotificationState.NONE,
    notifiedTime: toDate(row.notified_time),
})

const createWorkerSessionRepository = (pool = null, clock = () => new Date(), sessionAppRepo = null) => {
    const resolvePool = () => pool ?? getPool()
    const resolveSessionAppRepo = () =>
        sessionAppRepo ?? createSessionAppRepository(pool, clock)

    const insert = async session => {
        const p = resolvePool()
        await p.query(
            `INSERT INTO worker_session(state, username, worker_type, instance_type, instance_id, host, creation_time, update_time, id, api_key, timeout_time)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                session.state, session.username, session.workerType, session.instanceType, session.instance.id,
                session.instance.host, session.creationTime, session.updateTime, session.id,
                session.apiKey, session.timeoutTime,
            ]
        )
    }

    // update — state + update_time only. It deliberately does NOT write timeout_time: the deadline
    // moves through extendSession and nowhere else, so a stale in-memory session can never undo a
    // ratchet that landed while it was held.
    //   PENDING/ACTIVE → SET state, update_time WHERE id
    //   otherwise (CLOSED) → ALSO SET api_key = NULL
    const update = async session => {
        const p = resolvePool()
        const now = clock()
        if (session.state === PENDING || session.state === ACTIVE) {
            await p.query(
                `UPDATE worker_session
                    SET state = ?, update_time = ?
                    WHERE id = ?`,
                [session.state, now, session.id]
            )
        } else {
            await p.query(
                `UPDATE worker_session
                    SET state = ?, update_time = ?, api_key = NULL
                    WHERE id = ?`,
                [session.state, now, session.id]
            )
        }
        if (session.state === CLOSED) {
            // Cascade: a closed session's app associations are gone.
            await resolveSessionAppRepo().deleteForSession(session.id)
        }
    }

    // activateSession — the guarded PENDING → ACTIVE transition. It stamps active_time and
    // re-ratchets the startup lease from THAT moment: the lease is set at request time, but
    // provisioning can take many minutes, so a session that took eight minutes to come up would
    // otherwise reach ACTIVE with 22 minutes left. Monotonic, so this can only ever help.
    // Returns the activated session, or null when no PENDING row changed.
    const activateSession = async (sessionId, leaseMinutes) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET state = 'ACTIVE',
                    update_time = NOW(),
                    active_time = NOW(),
                    timeout_time = GREATEST(COALESCE(timeout_time, NOW()), NOW() + INTERVAL ? MINUTE)
                WHERE id = ? AND state = 'PENDING'`,
            [leaseMinutes, sessionId]
        )
        if (result.affectedRows === 0) {
            return null
        }
        const activated = await getSession(sessionId)
        log.debug(() => `${sessionTag(sessionId)} [startup-lease] activated, +${leaseMinutes}m from activation`
            + ` -> ${activated.timeoutTime?.toISOString()}`)
        return activated
    }

    // getSession — throws if the row does not exist.
    const getSession = async sessionId => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT ${SESSION_COLUMNS}
                FROM worker_session
                WHERE id = ?`,
            [sessionId]
        )
        const row = rows[0]
        if (!row) {
            throw new Error(`Non-existing worker session: ${sessionId}`)
        }
        return toSession(row)
    }

    // userSessions — dynamic WHERE: username always; optional worker_type, state IN(...),
    // instance_type.
    const userSessions = async (username, states = [], workerType = null, instanceType = null) => {
        const p = resolvePool()
        let query = `
                SELECT ${SESSION_COLUMNS}
                FROM worker_session
                WHERE username = ?`
        const params = [username]
        if (workerType) {
            query += `
                AND worker_type = ?`
            params.push(workerType)
        }
        if (states && states.length) {
            query += `
                AND state IN (${placeholders(states.length)})`
        }
        params.push(...(states || []))
        if (instanceType) {
            query += `
                AND instance_type = ?`
            params.push(instanceType)
        }
        // Starting order — without this, the UUID-keyed table returns index-scan order,
        // which shuffles the session lists (report, /sessions/active, picker, ssh menu).
        query += `
                ORDER BY creation_time`
        const [rows] = await p.query(query, params)
        return rows.map(toSession)
    }

    // allOpenSessions — EVERY currently-open (PENDING+ACTIVE) session, across ALL
    // users/workerTypes: the worker's authoritative open-session list, consumed by the budget
    // module's boot seed + hourly reconciler (workerClient.openSessions()). Deliberately a lean
    // projection rather than the full toSession() shape — just the 4 fields budget needs.
    const allOpenSessions = async () => {
        const p = resolvePool()
        const [rows] = await p.query(`
            SELECT username, id AS sessionId, instance_type, creation_time
            FROM worker_session
            WHERE state IN ('PENDING', 'ACTIVE')
        `)
        return rows.map(row => ({
            username: row.username ? row.username.toLowerCase() : row.username,
            sessionId: row.sessionId,
            instanceType: row.instance_type,
            creationTime: toDate(row.creation_time),
        }))
    }

    const sessions = async states => {
        const p = resolvePool()
        const [rows] = await p.query(
            `
                SELECT ${SESSION_COLUMNS}
                FROM worker_session
                WHERE state in (${placeholders(states.length)})`,
            states
        )
        return rows.map(toSession)
    }

    // timedOutSessions — PENDING only. A PENDING session's update_time is never refreshed
    // (heartbeat is a no-op until ACTIVE), so it is effectively the creation time: a provision
    // that hangs for ten minutes is dead. An ACTIVE session's lifetime is the stored
    // timeout_time and is swept by ExpireSessions instead.
    const timedOutSessions = async () => {
        const p = resolvePool()
        const now = clock()
        const [rows] = await p.query(
            `
                SELECT ${SESSION_COLUMNS}
                FROM worker_session
                WHERE state = ? AND update_time < ?`,
            [PENDING, Timeout.PENDING.lastValidUpdate(now)]
        )
        return rows.map(toSession)
    }

    const sessionOnInstance = async (instanceId, states) => {
        const p = resolvePool()
        const [rows] = await p.query(
            `
                SELECT ${SESSION_COLUMNS}
                FROM worker_session
                WHERE instance_id = ? AND state in (${placeholders(states.length)})`,
            [instanceId, ...states]
        )
        const row = rows[0]
        return row ? toSession(row) : null
    }

    // findUsernameByApiKey — null for a falsy apiKey. Only PENDING/ACTIVE sessions match, and the
    // username is lowercased.
    const findUsernameByApiKey = async apiKey => {
        if (!apiKey) {
            return null
        }
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT username FROM worker_session
                WHERE api_key = ? AND state IN (?, ?)`,
            [apiKey, PENDING, ACTIVE]
        )
        const row = rows[0]
        return row?.username ? row.username.toLowerCase() : null
    }

    // mostRecentlyClosedSessionByUser — a plain object { <username-lowercased>: Date }.
    const mostRecentlyClosedSessionByUser = async () => {
        const p = resolvePool()
        const [rows] = await p.query(`
            SELECT username, MAX(update_time) AS update_time
            FROM \`worker_session\`
            WHERE state = 'CLOSED'
            GROUP BY username
        `)
        const result = {}
        for (const row of rows) {
            result[row.username.toLowerCase()] = toDate(row.update_time)
        }
        return result
    }

    // mostRecentlyClosedSession — { timestamp: Date } or {}.
    const mostRecentlyClosedSession = async username => {
        const p = resolvePool()
        const [rows] = await p.query(`
            SELECT username, MAX(update_time) AS update_time
            FROM \`worker_session\`
            WHERE state = 'CLOSED' and username = ?
            GROUP BY username
        `, [username])
        const row = rows[0]
        return row ? {timestamp: toDate(row.update_time)} : {}
    }

    // ── the ratchet ───────────────────────────────────────────────────────────
    // THE only way a deadline moves. Three properties are load-bearing, and all three are
    // properties of this one statement:
    //   monotonic     — COALESCE handles the first write, GREATEST means out-of-order or small
    //                   extensions can never shorten a session;
    //   single clock  — every timestamp comes from the database's NOW(), never from a caller's
    //                   clock, which is what makes clock skew irrelevant (hence a duration
    //                   parameter rather than a timestamp);
    //   atomic reset  — clearing the notification state here is what makes "any extension cancels
    //                   the expiry cycle" a guarantee rather than a race.
    //
    // capHours bounds the candidate rather than refusing the write: refusing once now is already
    // past the boundary would let a verdict landing one second before it push the deadline to
    // anchor + cap + extension. Clamping subsumes refusal — past the boundary the clamped
    // candidate is already in the past, so GREATEST keeps the existing deadline and the ratchet is
    // a no-op. Only the busy verdict passes a cap; human and task events are never bounded.
    //
    // The cap is converted to MINUTES before it reaches SQL. MySQL takes only an integer number of
    // units in `INTERVAL n HOUR` and quietly rounds anything else — `INTERVAL 0.1 HOUR` is NOW()
    // and `INTERVAL 0.5 HOUR` is a full hour. maxUnattendedHours is a float by configuration, so
    // passing it as hours silently turned a fractional cap into either zero (disabling the busy
    // ratchet outright, since the clamp then always resolves to the anchor) or double what was
    // asked for. Minutes are integral for every sane input.
    //
    // interaction=true also stamps last_interaction_time, which is what re-anchors the cap. That
    // the busy verdict does NOT stamp it is the entire mechanism of the cap.
    //
    // THE NOTIFICATION RESET IS CONDITIONAL ON THE DEADLINE ACTUALLY MOVING. Clearing it
    // unconditionally reads as "any extension cancels the expiry", but a ratchet whose candidate
    // the cap clamped into the past moves nothing — and cancelling the cycle on the strength of a
    // no-op meant a session past its cap under continuous load re-notified on every single sweep
    // and never reached the end of its grace. Load stopped buying time, exactly as designed, and
    // then bought it back through the reset. Found in live simulation: eleven notifications in
    // eleven minutes, and the close only landed once the load stopped.
    //
    // Human events are unaffected: a notified session's deadline is by definition in the past, so
    // any real extension moves it and still cancels the cycle.
    //
    // Ordering matters. MySQL evaluates SET clauses left to right and later ones see the values
    // written by earlier ones, so the conditional columns must come BEFORE timeout_time or their
    // comparison would read the deadline this very statement just wrote.
    //
    // Returns true when a row changed — the one-shot senders (app/terminal opened, the Extend
    // button, the email link) have no successor to re-assert them, so they must be able to see
    // that the extension landed. They all pass interaction=true, which stamps NOW() and therefore
    // always changes the row.
    const extendSession = async ({sessionId, minutes, interaction = false, capHours = null, reason = null}) => {
        const p = resolvePool()
        const candidate = capHours == null
            ? 'NOW() + INTERVAL ? MINUTE'
            : `LEAST(NOW() + INTERVAL ? MINUTE, ${UNATTENDED_ANCHOR} + INTERVAL ? MINUTE)`
        const candidateParams = capHours == null
            ? [minutes]
            : [minutes, Math.round(capHours * 60)]
        const extendsDeadline = `${candidate} > COALESCE(timeout_time, NOW())`
        const [result] = await p.query(
            `UPDATE worker_session
                SET notification_state = IF(${extendsDeadline}, 'NONE', notification_state),
                    notified_time = IF(${extendsDeadline}, NULL, notified_time),
                    last_interaction_time = IF(?, NOW(), last_interaction_time),
                    timeout_time = GREATEST(COALESCE(timeout_time, NOW()), ${candidate})
                WHERE id = ? AND state = 'ACTIVE'`,
            [
                ...candidateParams,
                ...candidateParams,
                interaction ? 1 : 0,
                ...candidateParams,
                sessionId,
            ]
        )
        const applied = result.affectedRows > 0
        if (log.isDebug()) {
            // An UPDATE cannot return the value it wrote, so the resulting deadline costs a read.
            // Taken only under isDebug(), which is what keeps it affordable on the sampler's
            // per-session, per-tick cadence — and the deadline is the whole point of the line:
            // a ratchet that was clamped by the cap logs the same as one that was not, except
            // that the deadline does not move.
            const deadline = applied
                ? (await getSession(sessionId).catch(() => null))?.timeoutTime
                : null
            log.debug(() => [
                `${sessionTag(sessionId)} [${reason ?? 'unspecified'}]`,
                applied ? `+${minutes}m` : `NOT extended (+${minutes}m, no ACTIVE row)`,
                interaction ? 'interaction' : 'no interaction',
                capHours ? `capped at ${capHours}h from the anchor` : 'uncapped',
                deadline ? `-> ${deadline.toISOString()}` : null,
            ].filter(Boolean).join(', '))
        }
        return applied
    }

    // setSessionTimeout — the Usage-panel keep-alive slider. The ONE write that is not a ratchet:
    // it REPLACES the deadline, so the slider can shorten a session as well as lengthen it. That is
    // what makes the control legible — the cursor shows the current keep-alive, and moving it says
    // "make it this much", not "add this much".
    //
    // Everything else moves deadlines with GREATEST precisely so that automatic, repeating signals
    // can never shorten a session by arriving late or small. A human dragging a slider is neither
    // automatic nor repeating, and the last thing they said is the thing they meant.
    //
    // The notification reset is likewise unconditional here, unlike the ratchet's. The ratchet's
    // condition exists to stop the sampler cancelling a warning it did not earn; a deliberate
    // one-off act earns it in either direction. Setting a deadline in the past therefore restarts
    // the cycle rather than closing at once — the session is warned again and gets its full grace,
    // and Stop remains the way to hand an instance back immediately.
    const setSessionTimeout = async ({sessionId, minutes}) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET notification_state = 'NONE',
                    notified_time = NULL,
                    last_interaction_time = NOW(),
                    timeout_time = NOW() + INTERVAL ? MINUTE
                WHERE id = ? AND state = 'ACTIVE'`,
            [minutes, sessionId]
        )
        const applied = result.affectedRows > 0
        log.debug(() => `${sessionTag(sessionId)} [keep-alive] `
            + (applied ? `deadline SET to now +${minutes}m` : `not set (+${minutes}m, no ACTIVE row)`))
        return applied
    }

    // redeemExtension — the email link's extension, guarded on the notified_time the token was
    // signed against. The HMAC only proves the token is well-formed; two concurrent clicks both
    // verify, so single-use has to come from the write. Any extension (including this one) clears
    // notified_time, which is what spends the token.
    const redeemExtension = async ({sessionId, notifiedTime, minutes}) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET timeout_time = GREATEST(COALESCE(timeout_time, NOW()), NOW() + INTERVAL ? MINUTE),
                    last_interaction_time = NOW(),
                    notification_state = 'NONE',
                    notified_time = NULL
                WHERE id = ? AND state = 'ACTIVE' AND notified_time = ?`,
            [minutes, sessionId, notifiedTime]
        )
        const redeemed = result.affectedRows > 0
        log.debug(() => `${sessionTag(sessionId)} [email-link] ${redeemed ? `+${minutes}m` : 'token already spent or session gone'}`)
        return redeemed
    }

    // ── expiry sweep ──────────────────────────────────────────────────────────
    // expiredSessions — ACTIVE sessions past their deadline with no PENDING or ACTIVE task. The
    // task exclusion is a filter here AND a predicate on the close (§5b rule 3), because a task
    // can start during the grace period.
    const expiredSessions = async () => {
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT ${SESSION_COLUMNS}
                FROM worker_session s
                WHERE s.state = 'ACTIVE'
                  AND s.timeout_time IS NOT NULL
                  AND s.timeout_time < NOW()
                  AND NOT EXISTS (
                      SELECT 1 FROM task t
                       WHERE t.session_id = s.id AND t.state IN ('PENDING', 'ACTIVE'))`
        )
        return rows.map(toSession)
    }

    // Each transition is guarded on the state the sweep observed, so exactly one sweep sees it and
    // the event/email fire once even if a sweep overruns its minute.
    const notifyExpiry = async sessionId => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET notification_state = 'NOTIFIED', notified_time = NOW()
                WHERE id = ? AND state = 'ACTIVE' AND notification_state = 'NONE'
                  AND timeout_time IS NOT NULL AND timeout_time < NOW()`,
            [sessionId]
        )
        return result.affectedRows > 0
    }

    const markEmailed = async (sessionId, notifiedTime) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET notification_state = 'EMAILED'
                WHERE id = ? AND notification_state = 'NOTIFIED' AND notified_time = ?`,
            [sessionId, notifiedTime]
        )
        return result.affectedRows > 0
    }

    // dismissNotification — "I saw it, don't email me". It does NOT move the deadline: an easy
    // misclick must not be read as consent to close early, and the session still closes at
    // T+grace. DISMISSED is reachable from EMAILED too, so a user who dismisses after the mail
    // went out still silences a re-send.
    const dismissNotification = async (sessionId, username = null) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET notification_state = 'DISMISSED'
                WHERE id = ? AND notification_state IN ('NOTIFIED', 'EMAILED')
                  ${username ? 'AND username = ?' : ''}`,
            username ? [sessionId, username] : [sessionId]
        )
        return result.affectedRows > 0
    }

    // restartExpiryCycle — notify mode's answer to "what would have happened". Sessions must not
    // sit in EMAILED for as long as they are expired: switching production from notify to enforce
    // would then close every accumulated session on the first sweep. Resetting to NONE alone would
    // re-notify on the very next minute (the deadline is still in the past), so the reset also
    // ratchets the deadline by one grace period — the cycle restarts at the same cadence
    // enforcement would have used, and flipping to enforce starts everyone from a fresh warning.
    const restartExpiryCycle = async (sessionId, notifiedTime, minutes) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET notification_state = 'NONE',
                    notified_time = NULL,
                    timeout_time = GREATEST(COALESCE(timeout_time, NOW()), NOW() + INTERVAL ? MINUTE)
                WHERE id = ? AND state = 'ACTIVE' AND notified_time = ?`,
            [minutes, sessionId, notifiedTime]
        )
        return result.affectedRows > 0
    }

    // closeExpiredSession — the first transaction of the two-transaction close, with every
    // decision the sweep made re-asserted as a predicate. Selecting candidates and then closing
    // them is a lost update waiting to happen: an interaction landing in between would lose to a
    // decision made before it arrived. Zero rows changed means something rescued the session, and
    // the caller must NOT tear down the instance.
    const closeExpiredSession = async ({sessionId, notificationState, notifiedTime, graceMinutes}) => {
        const p = resolvePool()
        const [result] = await p.query(
            `UPDATE worker_session
                SET state = 'CLOSED', update_time = NOW(), api_key = NULL
                WHERE id = ?
                  AND state = 'ACTIVE'
                  AND timeout_time IS NOT NULL AND timeout_time < NOW()
                  AND notification_state = ?
                  AND notified_time = ?
                  AND notified_time < NOW() - INTERVAL ? MINUTE
                  AND NOT EXISTS (
                      SELECT 1 FROM task t
                       WHERE t.session_id = worker_session.id AND t.state IN ('PENDING', 'ACTIVE'))`,
            [sessionId, notificationState, notifiedTime, graceMinutes]
        )
        if (result.affectedRows === 0) {
            return false
        }
        await resolveSessionAppRepo().deleteForSession(sessionId)
        return true
    }

    return {
        activateSession,
        allOpenSessions,
        closeExpiredSession,
        dismissNotification,
        expiredSessions,
        extendSession,
        findUsernameByApiKey,
        getSession,
        insert,
        markEmailed,
        mostRecentlyClosedSession,
        mostRecentlyClosedSessionByUser,
        notifyExpiry,
        redeemExtension,
        setSessionTimeout,
        restartExpiryCycle,
        sessionOnInstance,
        sessions,
        timedOutSessions,
        update,
        userSessions,
    }
}

export {createWorkerSessionRepository}
