# Task orchestration

Current task ownership and container supervision are implemented. The durable-workflow, execution-bundle and
compute-step architecture below remains a proposal. The
[workplan](../workplan.md#tasks-and-exports) owns delivery slices and open work.

## Current implementation and limits

`task-manager` owns persisted task rows, the GUI API, task-list websocket, dispatch and container supervision.
Each task runs in a detached `openforis/task` container on the **main host**, with a task workspace, the user's
home and a per-task API key. It no longer needs a worker session or a task-executor instance while waiting for EE.
Task containers call gee through the gateway for EE work. The current contract is in
[task-manager's module notes](../../../modules/task-manager/CLAUDE.md).

Containers survive deploys and task-manager restarts and are rediscovered by label. This is container continuity,
not durable step resumption: a Docker daemon restart or host reboot interrupts the task, which is marked failed
and must be run again. Persisted task parameters are not coherent dependency bundles; recipe references still
resolve live. Operation-specific loops, such as Sampling Design's staged calls, do not supply a general persisted
workflow engine.

The remaining problems are recoverable workflows and external effects, coherent accepted inputs, main-host
capacity for local file work, and future resource-intensive/GPU steps. Task-type logic remains split between
`modules/task` execution and gee's task endpoints; task-manager supplies generic lifecycle management.

## Goals (target)

- No task instance runs while a task only waits on Earth Engine.
- Tasks survive deploys and restarts, including tasks that run for days.
- Task and interactive Earth Engine traffic share one admission point, protecting users and the system from
  `429 Too Many Requests`.
- Everything about one task type lives in one place in the source tree, even where it runs in several processes.
- Tasks can later run compute steps on an instance type chosen for that step, for only as long as the step runs.

## Non-goals

- Designing the compute runner, task environments or GPU provisioning.
- Changing what any existing task produces.

## Proposal

```
              GUI ──► gateway ──► task-orchestrator (main instance, shared, durable)
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
               gee                user homes               worker
     runs the task's EE code   downloads, VRT, metadata   sessions for compute steps
     behind EE admission                                      │
                │                                             ▼
          Earth Engine                              task-runner (task instance)
```

### Responsibilities

The target orchestrator extends or replaces task-manager's current lifecycle ownership with durable workflows and
session-independent policies. Its service/module packaging remains proposed. `worker` owns sessions and instances
only, behind a session contract that knows nothing about tasks. The orchestrator requests sessions when a task needs
an instance.
A **task instance** is a worker instance running a session for a task.

### One module, several runtimes

Task-specific code lives in the `task` module, organized by task type. Each type holds its workflow, Earth Engine
code and, later, compute code and runtime requirements together. The module produces:

- the **orchestrator** image, running workflows and file steps;
- the **runner** image for task instances, running compute steps (later);
- a **library** that gee loads to run each task's Earth Engine code.

Shared steps, such as downloads and VRT creation, live in the same module.

### Durable execution

A task is accepted with a persisted plan of steps. A SEPAL image download, for example, follows
*launch export → await export → download → post-process → clean up*.

- **Inputs are frozen with the plan.** The plan is persisted together with the execution bundle that
  [source-resolution.md](../recipes/source-resolution.md#retrieve) specifies for Retrieve, and with planning
  results such as tile ids and destinations. Later steps never reload edited or deleted recipes.
- **Deploys stay compatible with work in flight.** Deployed code must remain compatible with the plans and
  execution bundles of tasks already in flight.
- **External effects are recoverable.** After a restart, unfinished tasks resume from persisted state. Effects
  outside the orchestrator must be safe to repeat or discoverable after a lost response.
- **One active owner per step.** Superseded executions cannot advance the task.
- **Cancellation does not wait for running steps.** Even during an export wait, it blocks further work, promptly
  requests cancellation of running exports and compute steps, and starts cleanup. External cancellation may remain
  unconfirmed.
- **Cleanup obligations are recorded.** Cleanup is pursued on success, failure and cancellation. Unfinished
  cleanup and its failures remain visible.

### Execution identity

A task retains its accepted Google user or service account, billing project and storage backend (Drive or Cloud
Storage). Credentials are refreshed for that identity; changing the user's project does not move existing tasks.
Loss of authorization ends affected tasks with a specific explanation.

Disconnecting Google through SEPAL warns about affected tasks, blocks further work under that identity, and
attempts cancellation and cleanup before revoking access, without waiting indefinitely. External revocation may
prevent those attempts. Users are told when exports may continue or cleanup remains unfinished; the external
work stays linked to its SEPAL task even after SEPAL loses control of it.

### Earth Engine through gee

Task containers already reach Earth Engine through gee. The target is shared admission for task and interactive
traffic, with per-user, per-project and global limits, interactive priority and an explicit retry-later response for
unadmitted task requests. Audit the existing gee request path before claiming those scheduling guarantees.

### Policies without sessions

The orchestrator owns policies that must apply even when a task has no session:

- **Task limits**, including the number of outstanding exports per user, separate from gee's request limits.
- **Storage quota and budget**, checked when a task is accepted and before it writes files.
- **Account locks**, which prevent new tasks and cancel queued and running tasks.

Compute steps still request sessions, so session checks keep applying to them.

### Cost to users

Task execution is charged only for task-instance uptime, by instance type. Waiting for EE and execution on the
main instance are free. Existing storage charges still apply.

### What runs on the main instance

The main instance handles orchestration, polling, downloads and cheap file work such as VRT creation and metadata
updates. Resource-intensive work and task-specific environments belong on task instances. The orchestrator can
move to a separate instance without changing these responsibilities.

Files are written into user homes under the user's identity and permissions.

### Compute steps (later)

A compute step declares its runtime requirements and instance type. The orchestrator requests a session from
`worker`, runs the step on the runner and releases the session when the step ends. Task instances stay generic;
how task environments are defined and provided is outside this proposal.

Delivery slices, asset-mutation integration, scheduling and export extensions are tracked in the
[workplan](../workplan.md#tasks-and-exports).
