# CLAUDE.md - modules/user-data

Each user's cloud storage attachments ("Data" in the GUI, `~/data` in sandboxes) and the access to them. Issues
prefix-scoped credentials; holds the AWS keys that can act on the whole bucket. Measures each user's Data and publishes it for
budget; serves read-only credentials to users over their Data quota.

## Commands

```bash
sepal npm-test user-data                                   # Jest; starts the s3-emulator service first
sepal npm-test user-data -- --testPathPatterns attachments
npm run test:aws                                           # AWS isolation suite, see below
```

## Structure

- `attachments.js` — a user's attachments. Only the built-in Data attachment for now: `{id: 'data', name: 'Data',
  owner, provider: 's3', location: {bucket, prefix: 'users/<owner>/'}, mountPath: 'data', quota: true}`.
- `access.js` — validates the purpose, takes the mode from `QuotaState`, marks the user for measuring on read-write
  grants, builds the credentials URL, delegates to the provider.
- `quotaState.js` — in-memory set of users over their Data quota, from budget verdicts.
- `usage.js`, `usageRepository.js` — measuring Data per user and the `data_usage` table.
- `lifecycle.js` — erases the Data of purged users, durably.
- `events.js` — the published `userData.size` event.
- `db.js` — creates and migrates the `user_data` database.
- `providers/providers.js` — provider registry. A provider implements `grantAccess(attachment, {mode, purpose,
  credentialsUrl, authorizationTokenFile})` and `credentials(attachment, {mode})`.
- `providers/s3.js` — the only code that knows Data is S3, and the only production user of the AWS SDK.

## Usage, quota and events

MySQL database `user_data`, table `data_usage` (size and measurement times per user). `Usage` measures a user within
an hour after a read-write grant marked them dirty, and every user with Data (or measured before) once a day, then
publishes `userData.size {username, size}`. Every hourly tick also republishes the last recorded size of every
known user (no S3 call), so events lost while the broker is down heal within an hour; the first tick runs 60 s
after start, once the broker connection is up. A failed daily sweep is retried next tick without holding up the
measurements or the republish. A measurement clears only marks made before it started (`dirty_since` is the latest
mark), and a failure to mark never refuses access.

`QuotaState` holds, in memory, the users whose latest budget verdict has `dataQuotaExceeded` (or, from older
publishers, reason `DATA_QUOTA`); they get mode `read` (at most an hour stale after a restart, until budget's next
hourly verdict).

Subscribed queues: `user-data.budgetExceeded` (`budget.UserBudgetExceeded`), `user-data.budgetCleared`
(`budget.UserBudgetCleared`), `user-data.userStorageErased` (`storage.UserStorageErased`: erases the user's Data
and records it as empty).

The erase is durable: `Lifecycle` first stores `erase_requested_at` in `data_usage`, erases, then clears it. A failed
erase stays pending (the message queue retries only once) and `Lifecycle` retries all pending erasures hourly. Only
objects last modified before `erase_requested_at` are erased, so a retry spares Data written since. storage
republishes recent purges daily; a user with no `data_usage` row and nothing stored is ignored.

## HTTP (through the gateway at `/api/user-data`, as the authenticated user)

- `GET /attachments` — `[{id, name, mountPath, quota}]`.
- `POST /attachments/:id/access` `{purpose: 'sandbox' | 'mount' | 'task'}` — `{attachment, mode, rclone: {type,
  root, options}, env}`. Sandboxes and mounts get no credentials here: `env` points AWS clients at the credentials
  endpoint. Tasks reach the gateway over plain HTTP, which the AWS SDKs refuse for credential endpoints, so their
  `rclone.options` carry one-hour credentials inline.
- `GET /attachments/:id/credentials` — AWS container-credentials JSON (`AccessKeyId`, `SecretAccessKey`, `Token`,
  `Expiration`). Clients authenticate with `Authorization: Basic <base64(":" + api key)>`, read from
  `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE` (`/var/run/sepal-data-token`).

## Credentials

`AssumeRole` on the derived role with session tag `username`; the role policy limits every action to
`users/${aws:PrincipalTag/username}/`. Mode `read` adds a session policy without put or delete. Credentials are
cached per user and mode and renewed within 15 minutes of expiry.

## Dev-env emulator

`docker-compose.override.yml` runs the adapter in emulator mode against its own `s3-emulator` service
(`rclone serve s3`, bucket `sepal-dev-user-data`, key `sepal-dev` / `sepal-dev-secret`). Emulator mode hands out
that fixed key: there is no prefix isolation and no read-only mode in dev-env.

## AWS resources

The module runs with the environment's regular AWS keys (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) and derives
the bucket and role name `sepal-<env>-user-data` from `DEPLOY_ENVIRONMENT`, and the role ARN from the account of
the keys (`GetCallerIdentity` at startup). The boot then probes the bucket (`HeadBucket`) and the role (one
`AssumeRole` tagged `username=sepal-boot-probe`); any failure stops the boot. Emulator mode probes nothing.

`hosting-services/aws/sepal/provision-user-data.yml`, run by every rollout, creates the bucket and the role, which
trusts the IAM user that ran provisioning. The steps are in [docs/user-data-rollout.md](../../docs/user-data-rollout.md).

`*.aws.integration.test.js` checks prefix isolation and read-only mode on that real bucket. It runs only with
`USER_DATA_AWS_ISOLATION_TEST=true`, in the test deployment:
`docker exec -e USER_DATA_AWS_ISOLATION_TEST=true user-data npm run test:aws`.
