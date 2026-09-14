// WorkerSession repository — persists worker session lifecycle to the `worker`.`worker_session`
// table.
//
// Expiration (docs/session-expiration-model.md): every transition below is a compare-and-set guarded
// on what the sweep observed, so the sweep never acts on a fact it read earlier.
//
// Usernames are NOT normalized on the way out. The column collation is ascii_bin, so every
// lookup is case-sensitive and the schema is lowercase by construction (migration 001 copied the
// legacy rows as LOWER(username); requestSession and the REST boundary lowercase every write).
// Normalizing here would only ever have re-normalized data that is already normal.

import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

import {instanceName} from '../instanceName.js'
import {placeholders} from '../sql.js'
import {sessionTag} from '../tag.js'
import {createWorkerSession, NotificationState, State, Timeout} from './workerSession.js'

// `worker/expiry` spans this file and the sampler on purpose: one switch turns on the signal (pty
// advance, busy verdict), the ratchet it produced, and the resulting deadline. Keep both ends on
// the one logger name.
const log = getLogger('worker/expiry')

const {PENDING, ACTIVE, CLOSED} = State

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

export class WorkerSessionRepository {
    #db
    #clock
    #sessionAppRepository

    constructor(db, clock, sessionAppRepository) {
        this.#db = db
        this.#clock = clock
        this.#sessionAppRepository = sessionAppRepository
    }

    insert(session) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `INSERT INTO worker_session(state, username, worker_type, instance_type, instance_id, instance_name, host, creation_time, update_time, id, api_key, timeout_time)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    session.state, storedUsername(session.username), session.workerType, session.instanceType,
                    session.instance.id,
                    // Derived here rather than taken from the caller, so the stored name cannot
                    // disagree with the id it comes from in its own row. Write-only — see the column.
                    instanceName(session.id),
                    session.instance.host, session.creationTime, session.updateTime, session.id,
                    session.apiKey, session.timeoutTime,
                ]
            )
        })
    }

    // update — state + update_time only. It deliberately does NOT write timeout_time: the deadline
    // moves through extendSession and nowhere else, so a stale in-memory session can never undo a
    // ratchet that landed while it was held.
    //   PENDING/ACTIVE → SET state, update_time WHERE id
    //   otherwise (CLOSED) → ALSO SET api_key = NULL
    async update(session) {
        const now = this.#clock()
        await this.#db.withConnection(async connection => {
            if (session.state === PENDING || session.state === ACTIVE) {
                await connection.query(
                    `UPDATE worker_session
                        SET state = ?, update_time = ?
                        WHERE id = ?`,
                    [session.state, now, session.id]
                )
            } else {
                await connection.query(
                    `UPDATE worker_session
                        SET state = ?, update_time = ?, api_key = NULL
                        WHERE id = ?`,
                    [session.state, now, session.id]
                )
            }
        })
        if (session.state === CLOSED) {
            // Cascade: a closed session's app associations are gone.
            await this.#sessionAppRepository.deleteForSession(session.id)
        }
    }

    // activateSession — the guarded PENDING → ACTIVE transition. It stamps active_time and
    // re-ratchets the startup lease from THAT moment: the lease is set at request time, but
    // provisioning can take many minutes, so a session that took eight minutes to come up would
    // otherwise reach ACTIVE with 22 minutes left. Monotonic, so this can only ever help.
    // Returns the activated session, or null when no PENDING row changed.
    async activateSession(sessionId, leaseMinutes) {
        const activatedRows = await this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `UPDATE worker_session
                    SET state = 'ACTIVE',
                        update_time = NOW(),
                        active_time = NOW(),
                        timeout_time = GREATEST(COALESCE(timeout_time, NOW()), NOW() + INTERVAL ? MINUTE)
                    WHERE id = ? AND state = 'PENDING'`,
                [leaseMinutes, sessionId]
            )
            return result.affectedRows
        })
        if (activatedRows === 0) {
            return null
        }
        const activated = await this.getSession(sessionId)
        log.debug(() => `${sessionTag(sessionId)} [startup-lease] activated, +${leaseMinutes}m from activation`
            + ` -> ${activated.timeoutTime?.toISOString()}`)
        return activated
    }

    // getSession — throws if the row does not exist.
    getSession(sessionId) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
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
        })
    }

    // userSessions — dynamic WHERE: username always; optional worker_type, state IN(...),
    // instance_type.
    userSessions(username, states = [], workerType = null, instanceType = null) {
        return this.#db.withConnection(async connection => {
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
            const [rows] = await connection.query(query, params)
            return rows.map(toSession)
        })
    }

    // allOpenSessions — EVERY currently-open (PENDING+ACTIVE) session, across ALL
    // users/workerTypes: the worker's authoritative open-session list, consumed by the budget
    // module's boot seed + hourly reconciler (workerClient.openSessions()). Deliberately a lean
    // projection rather than the full toSession() shape — just the 4 fields budget needs.
    allOpenSessions() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(`
                SELECT username, id AS sessionId, instance_type, creation_time
                FROM worker_session
                WHERE state IN ('PENDING', 'ACTIVE')
            `)
            return rows.map(row => ({
                username: row.username,
                sessionId: row.sessionId,
                instanceType: row.instance_type,
                creationTime: toDate(row.creation_time),
            }))
        })
    }

    sessions(states) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `
                    SELECT ${SESSION_COLUMNS}
                    FROM worker_session
                    WHERE state in (${placeholders(states.length)})`,
                states
            )
            return rows.map(toSession)
        })
    }

    // timedOutSessions — PENDING only. A PENDING session's update_time is never refreshed
    // (heartbeat is a no-op until ACTIVE), so it is effectively the creation time: a provision
    // that hangs for ten minutes is dead. An ACTIVE session's lifetime is the stored
    // timeout_time and is swept by ExpireSessions instead.
    timedOutSessions() {
        return this.#db.withConnection(async connection => {
            const now = this.#clock()
            const [rows] = await connection.query(
                `
                    SELECT ${SESSION_COLUMNS}
                    FROM worker_session
                    WHERE state = ? AND update_time < ?`,
                [PENDING, Timeout.PENDING.lastValidUpdate(now)]
            )
            return rows.map(toSession)
        })
    }

    sessionOnInstance(instanceId, states) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `
                    SELECT ${SESSION_COLUMNS}
                    FROM worker_session
                    WHERE instance_id = ? AND state in (${placeholders(states.length)})`,
                [instanceId, ...states]
            )
            const row = rows[0]
            return row ? toSession(row) : null
        })
    }

    // findSessionByApiKey — null for a falsy apiKey. Only PENDING/ACTIVE sessions match, so
    // closing a session revokes its key.
    findSessionByApiKey(apiKey) {
        if (!apiKey) {
            return Promise.resolve(null)
        }
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT id, username, worker_type FROM worker_session
                    WHERE api_key = ? AND state IN (?, ?)`,
                [apiKey, PENDING, ACTIVE]
            )
            const row = rows[0]
            return row
                ? {sessionId: row.id, username: row.username, workerType: row.worker_type}
                : null
        })
    }

    // mostRecentlyClosedSessionByUser — a plain object { <username>: Date }.
    mostRecentlyClosedSessionByUser() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(`
                SELECT username, MAX(update_time) AS update_time
                FROM \`worker_session\`
                WHERE state = 'CLOSED'
                GROUP BY username
            `)
            const result = {}
            for (const row of rows) {
                result[row.username] = toDate(row.update_time)
            }
            return result
        })
    }

    // mostRecentlyClosedSession — { timestamp: Date } or {}.
    mostRecentlyClosedSession(username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(`
                SELECT username, MAX(update_time) AS update_time
                FROM \`worker_session\`
                WHERE state = 'CLOSED' and username = ?
                GROUP BY username
            `, [username])
            const row = rows[0]
            return row ? {timestamp: toDate(row.update_time)} : {}
        })
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
    async extendSession({sessionId, minutes, interaction = false, capHours = null, reason = null}) {
        const candidate = capHours == null
            ? 'NOW() + INTERVAL ? MINUTE'
            : `LEAST(NOW() + INTERVAL ? MINUTE, ${UNATTENDED_ANCHOR} + INTERVAL ? MINUTE)`
        const candidateParams = capHours == null
            ? [minutes]
            : [minutes, Math.round(capHours * 60)]
        const extendsDeadline = `${candidate} > COALESCE(timeout_time, NOW())`
        const applied = await this.#db.withConnection(async connection => {
            const [result] = await connection.query(
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
            return result.affectedRows > 0
        })
        if (log.isDebug()) {
            // An UPDATE cannot return the value it wrote, so the resulting deadline costs a read.
            // Taken only under isDebug(), which is what keeps it affordable on the sampler's
            // per-session, per-tick cadence — and the deadline is the whole point of the line:
            // a ratchet that was clamped by the cap logs the same as one that was not, except
            // that the deadline does not move.
            const deadline = applied
                ? (await this.getSession(sessionId).catch(() => null))?.timeoutTime
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
    setSessionTimeout({sessionId, minutes}) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
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
        })
    }

    // redeemExtension — the email link's extension, guarded on the notified_time the token was
    // signed against. The HMAC only proves the token is well-formed; two concurrent clicks both
    // verify, so single-use has to come from the write. Any extension (including this one) clears
    // notified_time, which is what spends the token.
    redeemExtension({sessionId, notifiedTime, minutes}) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
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
        })
    }

    // redeemTermination — the email's terminate link. Guarded on the notified_time the token was
    // signed against, exactly like redeemExtension: any extension clears it, so the rescue always
    // wins and a link left sitting in an inbox cannot kill an instance whose owner went back to
    // work. Deliberately WITHOUT the sweep's grace and task predicates — this is someone asking
    // explicitly, which is what the in-app [Terminate now] button does too.
    async redeemTermination({sessionId, notifiedTime}) {
        const terminated = await this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `UPDATE worker_session
                    SET state = 'CLOSED', update_time = NOW(), api_key = NULL
                    WHERE id = ? AND state = 'ACTIVE' AND notified_time = ?`,
                [sessionId, notifiedTime]
            )
            return result.affectedRows > 0
        })
        log.debug(() => `${sessionTag(sessionId)} [email-link] ${terminated ? 'terminated' : 'token already spent or session gone'}`)
        if (!terminated) {
            return false
        }
        await this.#sessionAppRepository.deleteForSession(sessionId)
        return true
    }

    // ── expiry sweep ──────────────────────────────────────────────────────────
    // expiredSessions — ACTIVE sessions past their deadline with no PENDING or ACTIVE task. The
    // task exclusion is a filter here AND a predicate on the close (§5b rule 3), because a task
    // can start during the grace period.
    expiredSessions() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
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
        })
    }

    // Each transition is guarded on the state the sweep observed, so exactly one sweep sees it and
    // the event/email fire once even if a sweep overruns its minute.
    notifyExpiry(sessionId) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `UPDATE worker_session
                    SET notification_state = 'NOTIFIED', notified_time = NOW()
                    WHERE id = ? AND state = 'ACTIVE' AND notification_state = 'NONE'
                      AND timeout_time IS NOT NULL AND timeout_time < NOW()`,
                [sessionId]
            )
            return result.affectedRows > 0
        })
    }

    markEmailed(sessionId, notifiedTime) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `UPDATE worker_session
                    SET notification_state = 'EMAILED'
                    WHERE id = ? AND notification_state = 'NOTIFIED' AND notified_time = ?`,
                [sessionId, notifiedTime]
            )
            return result.affectedRows > 0
        })
    }

    // dismissNotification — "I saw it, don't email me". It does NOT move the deadline: an easy
    // misclick must not be read as consent to close early, and the session still closes at
    // T+grace. DISMISSED is reachable from EMAILED too, so a user who dismisses after the mail
    // went out still silences a re-send.
    dismissNotification(sessionId, username = null) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `UPDATE worker_session
                    SET notification_state = 'DISMISSED'
                    WHERE id = ? AND notification_state IN ('NOTIFIED', 'EMAILED')
                      ${username ? 'AND username = ?' : ''}`,
                username ? [sessionId, username] : [sessionId]
            )
            return result.affectedRows > 0
        })
    }

    // restartExpiryCycle — notify mode's answer to "what would have happened". Sessions must not
    // sit in EMAILED for as long as they are expired: switching production from notify to enforce
    // would then close every accumulated session on the first sweep. Resetting to NONE alone would
    // re-notify on the very next minute (the deadline is still in the past), so the reset also
    // ratchets the deadline by one grace period — the cycle restarts at the same cadence
    // enforcement would have used, and flipping to enforce starts everyone from a fresh warning.
    restartExpiryCycle(sessionId, notifiedTime, minutes) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `UPDATE worker_session
                    SET notification_state = 'NONE',
                        notified_time = NULL,
                        timeout_time = GREATEST(COALESCE(timeout_time, NOW()), NOW() + INTERVAL ? MINUTE)
                    WHERE id = ? AND state = 'ACTIVE' AND notified_time = ?`,
                [minutes, sessionId, notifiedTime]
            )
            return result.affectedRows > 0
        })
    }

    // closeExpiredSession — the first transaction of the two-transaction close, with every
    // decision the sweep made re-asserted as a predicate. Selecting candidates and then closing
    // them is a lost update waiting to happen: an interaction landing in between would lose to a
    // decision made before it arrived. Zero rows changed means something rescued the session, and
    // the caller must NOT tear down the instance.
    async closeExpiredSession({sessionId, notificationState, notifiedTime, graceMinutes}) {
        const closedRows = await this.#db.withConnection(async connection => {
            const [result] = await connection.query(
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
            return result.affectedRows
        })
        if (closedRows === 0) {
            return false
        }
        await this.#sessionAppRepository.deleteForSession(sessionId)
        return true
    }
}

// toSession — maps instance_id/host → instance{id,host}.
const toSession = row => createWorkerSession({
    id: row.id,
    state: row.state,
    username: row.username,
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

const toDate = value => value ? new Date(value) : null
