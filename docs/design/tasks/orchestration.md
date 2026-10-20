# Task orchestration

Proposal for running tasks (exports today, compute workloads later) from a shared, durable orchestrator on the
main instance instead of on task-executor instances. Nothing described here is implemented.

## Problem

- **Cost.** A user's tasks share a task-executor instance per instance type. It stays up while any task runs,
  billing through hours or days spent mostly waiting for Earth Engine exports.
- **Compute workloads.** Workloads such as super-resolution need substantial local processing. Keeping a large
  or GPU instance idle while EE exports makes the current model unsuitable for them.
- **Sprawl.** A task's lifecycle is spread over `worker` (task rows, API, GUI websocket, dispatch), `modules/task`
  (execution) and the EE recipe code. Understanding or changing one task means visiting all of them.

## Goals

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

A new `task-orchestrator` service on the main instance, shared by all users, owns tasks end to end: task state, the
task API, the GUI websocket and the policies that apply to tasks. `worker` owns sessions and instances only, behind
a session contract that knows nothing about tasks. The orchestrator requests sessions when a task needs an instance.
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

gee becomes the single service for task and interactive Earth Engine requests, building on the REST access model
on the `sepal-server` branch. Its per-user, per-project and global request limits cover task traffic too, with
interactive requests taking priority; a task request that cannot be admitted is told to retry later.

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

## Stages

Each stage can be deployed on its own.

1. **Move task ownership, unchanged execution.** The orchestrator takes over tasks from `worker`, and `worker`
   stops depending on task state. Every operation still runs on a task-executor session using today's image.
2. **Durable engine and Earth Engine admission, for operations without file steps:** `image.DRIVE`, `image.GEE`,
   `ccdc.GEE` and `samplingDesign.GEE`. Requires the Retrieve execution bundles specified in
   [source-resolution.md](../recipes/source-resolution.md#retrieve), which are not yet implemented.
3. **File steps:** `image.SEPAL`, `timeseries.download` and `samplingDesign.SEPAL`.
4. **Retire task executors.** The task image leaves the worker AMI.
5. **Compute steps.** Runner, task environments and the first compute task.

## Open questions

- **Recovering lost launch responses.** Stable EE request ids prevent duplicate exports, but recovery must also
  find an accepted export whose launch response was lost. A reliable mechanism remains to be validated.
- **Main-instance capacity.** Which file work is cheap enough to stay on the main instance at current task volumes,
  and when the orchestrator needs an instance of its own.
- **Compute environments.** How task-specific runtime requirements are defined and provided on task instances.
