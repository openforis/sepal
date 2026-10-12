# How the worker stops unused instances: Groovy and Node

**Date:** 2026-08-08
**Language:** ASD-STE100 Simplified Technical English
**Applies to:** the `sepal` branch (the Node `worker`, `budget` and `gateway` modules)
**Compares with:** the `master` branch (the Groovy `sepal-server` monolith)

## 1. About this document

This document tells you how the worker module stops an instance that no person uses. It compares
the Node worker with the Groovy `sepal-server`. It gives the condition of the code now. It does not
give the history of the corrections.

For the history and the reasons, refer to these documents:

- `docs/instance-stopping-simulation.md`
- `docs/sepal-server-parity-audit.md`, section 3

This document obeys the ASD-STE100 rules. It uses technical names and technical verbs from
the SEPAL software. Section 2 gives these words. A full check against the licensed ASD-STE100
dictionary is not part of this work.

## 2. Technical names and technical verbs

| Word | Meaning in this document |
|---|---|
| SESSION | A record of one sandbox that one user uses. It has the state PENDING, ACTIVE or CLOSED. |
| INSTANCE | The machine that holds the sandbox containers of one session. |
| TO RESERVE | To give an instance to one session. |
| TO RELEASE | To take an instance back from a session. On AWS, the worker only changes the tag to `State=idle`. The machine continues to operate. |
| TO TERMINATE | To destroy an instance. The machine stops. The user pays no more money for it. |
| SWEEP | A task that the worker does again after each interval. |
| PROBE | An operation that asks the Docker daemon about a container. |
| HEARTBEAT | A message that tells the worker that a session is in use. |
| VERDICT | The result of a probe. It is PROVISIONED, MISSING or UNKNOWN. |
| MISS | One MISSING verdict for one session. |
| GRACE | An interval in which a sweep does no work. |

## 3. The two stages of a stop

The worker stops an instance in two stages. The triggers of the two stages are different.

**Stage 1. The worker closes the session.**

1. The worker sets the state of the `worker_session` row to CLOSED.
2. The worker sets the api key to NULL.
3. The worker sends the `workerSession.WorkerSessionClosed` event.

**Stage 2. The worker releases the instance. Then the worker terminates it.**

1. The worker releases the instance. On AWS the worker only changes the tag to `State=idle`.
2. The `SizeIdlePool` sweep terminates the instance later.

Usually stage 1 causes stage 2. But each stage also has its own sweep. Each sweep finds the
instances that the other stage did not clean.

## 4. The triggers that close a session

| Trigger | Groovy `sepal-server` | Node worker |
|---|---|---|
| Timeout of the heartbeat | `CloseTimedOutSessions` each 1 minute. PENDING and ACTIVE both time out after 10 minutes. The `earliest_timeout_time` column is an AND-guard. | The same SQL and the same values. But the sweep does no work in the first 2 minutes after a start. |
| The instance is not there | `CloseSessionsWithoutInstance` each 1 minute. It closes the row only. It does not release the instance. | The same schedule and the same rule. But the probe gives three verdicts. The worker closes a session only after two MISSING verdicts in sequence. |
| The user is above the budget | A poll each 11 minutes. | The `budget` module sends the `budget.UserBudgetExceeded` event. |
| An administrator locks the user | The `user.UserLocked` event. | The same. |
| The last task stops | `UpdateTaskProgress` and `CancelTimedOutTasks`. | The same. |
| A user or an administrator sends a command | The REST DELETE operation. | The same. |
| The session uses few resources | Not available. | `EvaluateIdleSessions` each 1 minute. The configuration disables it by default. |

## 5. The triggers that release or terminate an instance

| Trigger | Interval | Condition |
|---|---|---|
| `ReleaseUnusedInstances` | 1 minute | The instance is reserved. No open session uses it. It is more than 5 minutes old. |
| `SizeIdlePool` | 1 minute | There are more idle instances of one type than the target number. The worker terminates the surplus. If a type has no target, the target is zero. Thus the worker terminates all idle instances of that type. |
| `RemoveOrphanedContainers` | 12 minutes | A container on the local daemon has no session and no instance. This applies to local operation only. |

`SizeIdlePool` is the only sweep that terminates an instance. The worker starts this sweep always.
An empty target list does not stop it.

## 6. The signals that keep a session open

| Signal | Sender | Interval |
|---|---|---|
| Heartbeat for a web session | The `gateway` module | 30 seconds |
| Heartbeat for an SSH session | The `alive.sh` script in the sandbox | 30 seconds |
| Heartbeat for a task session | The task progress messages | Not applicable |

A heartbeat with no body does not show user activity. The sender adds `{"userActivity": true}` only
after a true user operation. A heartbeat to a closed session gives the answer 404. Then the gateway
removes the session from its cache.

A PENDING session is different. Its heartbeat does no work. A PENDING session times out from its
creation time.

## 7. The behavior after a restart or a failure

| Condition | Groovy `sepal-server` | Node worker |
|---|---|---|
| The worker starts | Each sweep does its first operation immediately. | The same. But `CloseTimedOutSessions` does no work in the first 2 minutes. |
| The worker was off for more than 10 minutes | All open sessions look old. The first sweep closes them all. | The grace keeps the sessions open. The heartbeat senders get four intervals to show that a session is in use. |
| One item in a sweep fails | The sweep stops. The other items get no operation. | Each sweep puts each item in its own try/catch block. |
| The Docker daemon does not answer | The worker closes the session. | The worker records the verdict UNKNOWN. It closes no session. |
| The message broker stops | Not applicable. The monolith used no broker. | The queues are durable. The messages are persistent. The `budget` module sends the verdicts again each hour. |
| The `budget` module stops | Not applicable. | The worker permits a session for an unknown user. It refuses a session for a locked user. |

## 8. The result of the comparison

**Better than the monolith:**

- Each sweep isolates the failure of one item.
- The worker finds a session that uses few resources. This function is new.
- The worker knows the difference between a heartbeat and true user activity.
- A heartbeat to a closed session gives 404. Thus the gateway holds no old cache records.
- The budget rules operate at the time of the event, not after 11 minutes.
- A worker outage does not close the sessions of the users.
- An outage of the Docker daemon does not close the sessions of the users.

**Worse than the monolith:**

- The budget check is now a network operation. Thus it needs a fallback path.
- The heartbeat loop of the gateway is in a different process. Refer to section 9.2.

**The same as the monolith:**

- All the timeout values.
- The SQL of the timeout sweep.
- The two transactions of a session close.
- The minimum age of 5 minutes for an unused instance.
- The compare-and-swap UPDATE that reserves an instance.
- The error path of a release operation.

## 9. Known limits

### 9.1 A worker that restarts again and again does not close old sessions

The grace is 2 minutes. It starts at each start of the worker. Thus a worker that restarts more
quickly than 2 minutes never does the timeout sweep. The worker does not close the old sessions.
The user continues to pay for these instances until an operator corrects the fault.

A test showed this behavior. Three restarts with an interval of 90 seconds kept a 40-minute-old
session open. The worker closed the session 136 seconds after the last restart.

Two conditions decrease the risk:

- A worker that restarts again and again is a fault. An operator must correct it.
- The old code was worse. It closed all the sessions that were in use at each restart.

This limit applies to the timeout sweep only. The sweep that finds an instance that is not there operates more
quickly in this condition. Each restart gives one more MISS.

To remove this limit, keep a `last_seen` value in the database. Then make the grace equal to
`max(0, downtime − uptime)`. This value becomes zero as the uptime increases. Thus a restart cannot
stop the sweep. This change needs a migration and a database write each minute.

### 9.2 A gateway restart stops the heartbeats of some sessions

**Why a heartbeat is necessary.** The worker closes an ACTIVE session when its `update_time` is more
than 10 minutes old. Only a heartbeat makes `update_time` new. The worker has no other data about
the use of a session. Thus a session stays open only while a sender sends heartbeats for it.

**Who sends the heartbeats, and to whom.** All the senders send to the same receiver: the worker,
with a `POST /sessions/session/{id}`.

| Sender | Session type | The condition that keeps the heartbeats |
|---|---|---|
| The `gateway` module (`sandboxSessionManager`) | A web app: RStudio, Jupyter or Shiny | A record of the session in the memory of the gateway |
| The `alive.sh` script in the sandbox | SSH (the terminal in the browser also uses SSH) | An `ssh` process of the user in the sandbox |
| The task | A task | The task sends progress messages |

**How the gateway makes a record.** The gateway keeps a record of each session in its memory. Each
30 seconds it sends one heartbeat for each record. It makes a record only from a user operation:

- a start of an app (`POST /api/sandbox/start`),
- a status request from the GUI,
- a proxied request to the sandbox (the gateway attributes the request to a session).

The gateway removes a record when the app leaves the session, when the worker gives the answer 404,
or when the session closes. The browser of the user causes the first two conditions: a tab close
sends a release request, and a lost websocket connection causes `clientDown`. Then the worker
removes the app associations of that browser and tells the gateway. Thus the heartbeats of the
gateway show that a browser holds the app.

The gateway does not read the open sessions from the worker at its start.

**The failure.** A restart of the gateway removes all the records. Two operations make the records
again:

- The browser makes a new websocket connection and gets a new client id. Then the GUI sends
  `POST /api/sandbox/start` again for each open app tab (`createSessionReassert` in
  `appSessionMonitor.jsx`). This operation is automatic and takes some seconds.
- The user sends a new request to the sandbox through the gateway.

Thus a user with an open browser keeps the session. These sessions get no heartbeat again:

- A session with a legacy per-endpoint record. Such a session has no app association. The record in
  the memory of the gateway was the only sender of its heartbeats.
- A session whose browser does not connect again in the 10 minutes after the restart.

The worker closes these sessions. Subsequently `SizeIdlePool` terminates the instance.

The risk is small. In usual operation the gateway also stops the heartbeats when the browser goes
away. Thus the restart makes a usual condition longer. It does not make a new condition.

To remove this limit, the gateway reads the app associations of the worker at its start and makes
its records again. The worker keeps these associations in the `session_app` table with the id of the
owner client. Thus a rebuild keeps the same rule: a session with a live association gets heartbeats,
a session with no association does not. The route `GET /sessions/open` gives the open sessions, but
it gives no host and no app path. Thus this change needs more data in a route.

The Groovy monolith had the same risk in a different form. Its map of the sessions was in the same
process as the sweep. A restart removed the map. But the restart also made each `update_time` look
old. Thus the first sweep closed all the sessions, not only the sessions with no browser.

### 9.3 No test operates the AWS provider

The file `awsInstanceProvider.js` does these operations:

- It makes the EC2 tags.
- It sends the `RunInstances` command.
- It sends the `TerminateInstances` command.
- It polls for the instances with the tag `Starting=true`.

No test operates this file with a true AWS account. The unit tests use `aws-sdk-client-mock`. The
development environment uses `HOSTING_SERVICE=local`. The code above the provider has tests. The
provider itself does not.

## 10. The live test

An engineer did a test of all the functions above with a live stack on 2026-08-07. The test used
true sessions, true containers and the usual 1-minute schedule. The engineer caused failures with
these operations:

- The engineer stopped the Docker API.
- The engineer paused the Docker API.
- The engineer removed the containers.

The test had 8 campaigns and 46 checks. All the checks were correct. The engineer also operated the
old code with the same failures. Thus the report gives measurements, not opinions.

For the full report, refer to `docs/instance-stopping-simulation.md`.
