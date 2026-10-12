# Report of the live test of the instance stop functions

**Date of the test:** 2026-08-07. **Addendum:** 2026-08-08.
**Language:** ASD-STE100 Simplified Technical English
**Branch:** `sepal`. The campaigns used the commit `c9749986f`.

## 1. About this document

This document gives the results of a live test. The test examined how the worker stops an instance
that no person uses.

The test examined two guards:

- the grace of the timeout sweep after a start of the worker;
- the probe that gives three verdicts, and its count of the MISSING verdicts.

The test also examined the full sequence: the worker closes the session, releases the instance and
terminates it.

This document obeys the ASD-STE100 rules. It uses the technical names of
`docs/instance-stopping-parity-asd-ste100.md`, section 2. A full check against the licensed
ASD-STE100 dictionary is not part of this work.

## 2. Result

The test showed that the two guards operate correctly.

| Item | Value |
|---|---|
| Campaigns | 8 |
| Checks | 46 |
| Checks that were not correct | 0 |
| Time | About 2 hours and 40 minutes |
| Faults in the test tools | 4. The engineer corrected them all. |
| Limits of the design that the test showed | 1. Refer to section 8. |
| Faults in the software that the test found | 0 in the two guards. 1 related fault. Refer to section 12. |

The test did not examine the AWS provider. Refer to section 11.

## 3. The method

The test used a live stack with `HOSTING_SERVICE=local`. The stack had true sessions, true sandbox
containers, the usual 1-minute schedule and a true MySQL database.

The worker container reads the source directory directly. Thus the test used the code of the
commit. A new message in the log gave proof of this:

```
Within the startup grace period — skipping the timed-out session sweep
```

The old code does not write this message.

The test tools did these operations:

- They sent a heartbeat with no body each 20 seconds.
- They read the database each 10 seconds and recorded each change of state.
- They made the checks.
- They caused failures with the `docker` command.

All the sessions used the type `T3aSmall`. The cost of this type is USD 0.0204 each hour. This
value is less than `IDLE_MIN_HOURLY_COST`. Thus the idle-session functions could not operate. The
engineer made sure of this. The count of the idle operations was 0. The count of the sessions with
the state WARNED was 0.

## 4. How the engineer caused the failures

| Operation | What the probe finds | Verdict |
|---|---|---|
| `docker rm -f <sandbox>` | The message `404 No such container` | MISSING |
| `docker stop <sandbox>` | The container is there, but it does not operate | MISSING |
| `docker stop docker-api` | The daemon refuses the connection | UNKNOWN |
| `docker pause docker-api` | The connection opens, but no answer comes | UNKNOWN |
| A change of `update_time` in the database | An outage of the worker of any length | Not applicable |

The change of `update_time` is the only value that the engineer made artificially. This value is
the only input of the timeout sweep. Thus the change gives a true image of an outage. The engineer
always stopped and started the true worker process. Only the length of the outage was different.

All the other conditions used the usual values:

- the interval of 1 minute between the sweeps;
- the timeout of 10 minutes;
- the grace of 2 minutes;
- the count of two MISSING verdicts;
- the maximum interval of 30 minutes for the UNKNOWN verdict.

## 5. Campaign 1. The grace after an outage of 40 minutes

The engineer made two sessions. The engineer made both sessions 40 minutes old. This interval is
four times the timeout. Only one difference was between the two sessions. Session A got heartbeats
after the restart. Session B got no heartbeats.

| Time | Event |
|---|---|
| 16:33:11 | The engineer stopped the worker and changed the two `update_time` values. |
| 16:33:11 | The engineer started the worker. The tool started the heartbeats for session A. |
| 16:33:13 | The sweep did no work. The worker closed no session. |
| 16:34:13 | The sweep did no work again. |
| 16:35:13 | The first sweep after the grace closed session B. Session A stayed open. |

| Check | Result |
|---|---|
| Session A stayed open | Correct |
| The worker closed session B at the first sweep after the grace | Correct |

The limit of the grace is accurate. The sweep at 120.000 seconds did its work. The two sweeps
before it did no work.

The old code closes both sessions at 16:33:13.

## 6. Campaign 2. The probe with three verdicts

### 6.1 An outage of the Docker API of 5 minutes

The engineer stopped the `docker-api` container for 5 minutes. Two sessions were open. The two
sandbox containers continued to operate.

| Check | Result |
|---|---|
| The two sessions stayed open | Correct |
| The count of the sessions that the worker closed was 0 | Correct |
| The count of the UNKNOWN verdicts was 10 | Correct |
| The count of the MISSING verdicts was 0 | Correct |
| The two sessions stayed open after the daemon started again | Correct |

The old code closes the two sessions at the first sweep. Then it terminates the two machines 5
minutes later. An outage of the daemon of 5 minutes is a usual event.

### 6.2 A container that is not there, and a container that comes back

The engineer caused three failures at the same time.

| Session | Failure | Sweep at 16:49:13 | Sweep at 16:50:13 | Result |
|---|---|---|---|---|
| C | `docker rm -f` | MISSING (miss 1) | MISSING (miss 2) | The worker closed it |
| D | `docker stop` | MISSING (miss 1) | MISSING (miss 2) | The worker closed it |
| A | `docker stop`, then a start at 16:49:31 | MISSING (miss 1) | PROVISIONED | The session stayed open |

| Check | Result |
|---|---|
| The two types of MISSING verdict close a session | Correct |
| The worker closed no session after one MISS | Correct |
| The worker did not close session A | Correct |

### 6.3 A MISSING verdict, then an UNKNOWN verdict, then a MISSING verdict

An UNKNOWN verdict must not remove a MISS from the count.

| Time | Verdict | Count of the MISSES | State |
|---|---|---|---|
| 19:02:21 | MISSING | 1 | Open |
| 19:03:21 | UNKNOWN | 1 | Open |
| 19:04:21 | MISSING | 2 | The worker closed it |

The test found the same behavior a second time by accident. In that sequence, three UNKNOWN
verdicts were between the two MISSING verdicts. The interval was four minutes. The count of the
MISSES stayed at 1. Then the second MISSING verdict closed the session.

### 6.4 A test of the old code

The engineer took the old code from the commit `c9749986f^`. The engineer gave the old code the
same inputs as the live failures. The results were:

```
A. daemon unreachable, container ALIVE -> pre-fix classified 1/1 as MISSING
A. pre-fix sweep closed [s-live] on the FIRST sweep
B. 40-min outage -> pre-fix closed [s-stale] on its immediate startup run
```

Thus these results are measurements. They are not opinions.

## 7. Campaign 3. The full stop sequence

### 7.1 A command from a user

| Check | Result |
|---|---|
| The worker closed the session immediately | Correct |
| The worker removed the container immediately | Correct |
| The instance was no more reserved | Correct |

### 7.2 A timeout of the heartbeat

The engineer made a session and sent no heartbeats.

| Time | Event |
|---|---|
| 17:03:13 | The worker closed the session after 603 seconds. Then it released the instance and removed the container. |
| 17:04:13 | `SizeIdlePool` terminated 1 surplus idle instance. |

The value 603 seconds is the 10-minute timeout plus the interval to the next sweep.

### 7.3 A session with no instance

| Time | Event |
|---|---|
| 16:50:13 | `CloseSessionsWithoutInstance` closed the sessions C and D. It released no instance. |
| 16:51:13 | `ReleaseUnusedInstances` released the two instances and removed the two containers. |
| 16:52:13 | `SizeIdlePool` terminated the two surplus idle instances. |

Three sweeps do three different tasks. There is one minute between them. The sequence in section
7.2 is more quick, because a usual close also releases the instance.

### 7.4 The money

The `budget` module must stop the charge when a session closes.

| Session | Cause of the close | Time of the close | Time of the `to_time` value |
|---|---|---|---|
| B | Timeout after an outage | 16:35:13 | 16:35:14 |
| C | Two MISSING verdicts (404) | 16:50:13 | 16:50:14 |
| D | Two MISSING verdicts (stopped) | 16:50:13 | 16:50:14 |
| E | A command from a user | 16:53:14 | 16:53:15 |

The count of the closed sessions with no `to_time` value was 0. The `budget` module got each event
in about 1 second.

## 8. Campaign 4. Special conditions

### 8.1 The memory of the MISSES is empty after a restart

The engineer removed a container while the worker was off. Thus no MISS was possible before the
restart.

| Time | Event |
|---|---|
| 19:04:56 | The engineer started the worker. |
| 19:04:57 | The first sweep gave MISS 1. The worker closed no session. |
| 19:05:57 | The second sweep gave MISS 2. The worker closed the session. |

The worker closed the session 67 seconds after the restart. The memory of the MISSES was empty.

### 8.2 The `earliest_timeout_time` value

The engineer made a session 40 minutes old. The engineer also set `earliest_timeout_time` to a time
2 hours in the future.

| Check | Result |
|---|---|
| The session stayed open through a restart and 5 minutes of sweeps | Correct |
| The worker closed the session about 75 seconds after the engineer removed the value | Correct |

### 8.3 A PENDING session

A PENDING session never refreshes its `update_time` value. Thus it has the highest risk.

| Time | Event |
|---|---|
| 18:10:20 | The engineer started the worker. |
| 18:10:21 | The sweep did no work. |
| 18:11:21 | The sweep did no work again. |
| 18:12:21 | The first sweep after the grace closed the session. |

### 8.4 A worker that restarts again and again

This condition is a known limit of the design. Refer to section 9.1 of
`docs/instance-stopping-parity-asd-ste100.md`.

| Time | Event | State of the session |
|---|---|---|
| 17:20:25 | Restart 1 | Open |
| 17:21:55 | Restart 2 | Open |
| 17:23:26 | Restart 3 | Open |
| 17:25:42 | The engineer made no more restarts | The worker closed the session |

The worker closed the session 136 seconds after the last restart. This value is the 2-minute grace
plus the interval to the next sweep.

### 8.5 A probe that does not answer

The engineer paused the `docker-api` container. Thus the connection opened, but no answer came.
The old code has no time limit for this operation.

| Time of the sweep | Time of the verdict | Interval | Failure |
|---|---|---|---|
| 17:14:20.868 | 17:14:20.867 | About 0 milliseconds | The daemon refused the connection |
| 17:16:20.866 | 17:16:30.865 | 9.999 seconds | The connection gave no answer |
| 17:17:20.866 | 17:17:30.863 | 9.997 seconds | The connection gave no answer |

These measurements show three facts:

1. The time limit of 10 seconds operates accurately.
2. The interval between the sweeps stayed at 60.000 seconds. No sweeps collected in a queue.
3. The verdicts of two instances came in the same millisecond. Thus the probes operate at the same
   time. The time for many sessions is 10 seconds in total, not 10 seconds for each session.

### 8.6 A test to find a fault

The engineer wrote one test to find a fault in the new code. The idea was: the memory of the MISSES
is in the process only. Thus a worker that restarts quickly could lose the count. Then the worker
could keep a dead instance for a long time.

The test found no fault. The reason is clear. The sweep that finds an instance that is not there does its
first operation immediately at a start. Thus a restart gives one MISS immediately. Two MISSES
collect in about 60 seconds after a restart. In usual operation they need about 120 seconds.

The difference between the two guards is correct:

- An outage destroys the `update_time` value. Thus this value needs time to become correct again.
- The probe makes its data again at each sweep. Thus it is correct immediately after a restart. A
  grace would only make the cleanup more slow.

## 9. Campaign 5. The maximum interval for the UNKNOWN verdict

If the probe can give no verdict, the worker must close the session at the end. If it does not, the
user pays for a machine for an unlimited time.

The engineer stopped the `docker-api` container for the full test. The tool sent a heartbeat each
15 seconds. Thus only the maximum interval could close the session.

| Time | State | Count of the UNKNOWN verdicts |
|---|---|---|
| 20 minutes | Open | 32 |
| 25 minutes | Open | 37 |
| 30 minutes | Open | 41 |
| 31 minutes | The worker closed it | Not applicable |

| Check | Result |
|---|---|
| The maximum interval closed the session | Correct |
| The time was between 29 and 33 minutes | Correct. The value was 31 minutes. |
| The worker wrote a WARN message | Correct |

The message was:

```
Session 715e40c2-… (admin) has gone unprobeable for the whole backstop window
```

41 UNKNOWN verdicts in 30 minutes did not close the session. The maximum interval closed it. Thus
the two parts of the design are correct. An UNKNOWN verdict is not proof of a dead instance. But an
UNKNOWN verdict does not give an unlimited permission.

## 10. Campaign 6. The triggers that come from an event

| Trigger | Result |
|---|---|
| `budget.UserBudgetExceeded` | Correct. The worker closed the session in 12 seconds. |
| `user.UserLocked` | Correct. The worker closed the session in 12 seconds. |

The engineer also sent a request for a new session while the locked-user list held the user. The
answer was 201, not 403. This answer is correct. The worker asks the `budget` module for a live
answer first. The live answer was "below the budget". The locked-user list is only a fallback.

## 11. What the test did not examine

1. **The AWS provider.** The stack used `HOSTING_SERVICE=local`. The probe and the count of the
   MISSES are in the common code. Thus the test examined them. But the test did not examine
   `awsInstanceProvider.js`.
2. **Many daemons.** In local operation, all the instances are containers on one daemon. Thus one
   command stopped the probe for all the sessions at the same time. On AWS, each instance has its
   own daemon.
3. **A large quantity of sessions.** The test used three sessions or less.
4. **The idle-session functions.** The configuration disabled them. A different report gives these
   tests: `docs/instance-resource-monitoring-simulation.md`.

## 12. The addendum of 2026-08-08

This test did not examine a correction. It showed the necessity for one.

Section 7.3 showed that `SizeIdlePool` is the only sweep that terminates an instance. All the other
sweeps only close a row or release an instance. Thus the engineer examined the start conditions of
this sweep.

The old code started this sweep only if one instance type had a target of more than zero idle
instances. Only one type in the catalog had such a target. Thus a change of that one value would
stop all the terminate operations. The instances would continue, and the users would continue to
pay.

The correction starts the sweep always. The Groovy code did the same. An empty target list does not
mean "no work". It means "all idle instances are surplus".

The engineer did a live test of the correction. The engineer set the target of `T3aSmall` to zero
temporarily.

| Condition | Message in the log | Count of the sweeps |
|---|---|---|
| Before the correction | `no instance types with idleCount > 0 — SizeIdlePool not scheduled` | 0 |
| After the correction | `scheduling SizeIdlePool every 60000ms for types: none (all idle instances are surplus)` | 1 each minute |

Three new unit tests also examine this behavior. Before the correction, the start conditions of the
sweep had no tests.

## 13. The messages in the log

The engineer caused many failures in 95 minutes. The worker wrote only two `[ERROR]` messages. The
two messages were the same:

```
Scheduled job RemoveOrphanedContainers failed [TypeError: fetch failed]
```

This message is correct. The 12-minute sweep tried to use the daemon that the engineer stopped. The
scheduler caught the error. Thus the schedule continued.

The code of the two guards wrote no error messages. The probe changes a failure into a verdict.
Thus an outage of the daemon gives a WARN message for each instance and an INFO message for each
decision. It gives no error.

## 14. The quality of the test tools

Four of the test scripts had faults. No fault was in the software of the worker. But all four
faults could hide a fault. This risk is the important point.

| Fault | Effect |
|---|---|
| The script changed `update_time` while the worker operated. Thus the timeout sweep closed the sessions before the test started. | One incorrect failure and two incorrect successes |
| The script calculated the time of the next sweep incorrectly. Thus the sequence of the failures was not correct. | One incorrect failure |
| The check counted the verdicts of all the sessions, not the verdicts of one session. | One incorrect failure |
| The function that waits for a sweep counted the lines in a time window. This count does not increase. | The campaign stopped for 42 minutes |

The two faults that give an incorrect success are the most dangerous. An engineer examines a
failure. But an engineer keeps a success as proof.

Two methods found these faults:

- The engineer identified the sweep that closed each session from the name in the log. The name
  `closeSession` and the name `closeSessionsWithoutInstance` are different sweeps. The state of the
  session does not give this information.
- The engineer read the log of the worker, not only the results of the test scripts.

The engineer corrected the tools in these ways:

- The tools now wait for a message in the log. They do not calculate the time of a sweep.
- The tools change the database only while the worker is off.
- Each campaign closes the sessions of the campaign before it.

## 15. The condition of the stack at the end

| Item | Value |
|---|---|
| Open sessions | 0 |
| Artificial database rows | 0 |
| Sandbox containers | 0 |
| The `docker-api` container | Operates. It is not in the pause condition. |
| The `worker` container | Operates correctly |
| Changes to the configuration of the worker | 0 |

The engineer caused all the failures from outside the module. Thus no configuration needed a
correction at the end.
