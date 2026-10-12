# CLAUDE.md - modules/user-data

Each user's cloud storage attachments ("Data" in the GUI, `~/data` in sandboxes) and the access to them. Issues
prefix-scoped credentials; holds the only AWS identity that can act on the whole bucket. No database yet.

## Commands

```bash
sepal npm-test user-data                                   # Jest; starts the s3-emulator service first
sepal npm-test user-data -- --testPathPatterns attachments
npm run test:aws                                           # AWS isolation suite, see below
```

## Structure

- `attachments.js` — a user's attachments. Only the built-in Data attachment for now: `{id: 'data', name: 'Data',
  owner, provider: 's3', location: {bucket, prefix: 'users/<owner>/'}, mountPath: 'data', quota: true}`.
- `access.js` — validates the purpose, decides the mode, builds the credentials URL, delegates to the provider.
- `providers/providers.js` — provider registry. A provider implements `grantAccess(attachment, {mode, purpose,
  credentialsUrl, authorizationTokenFile})` and `credentials(attachment, {mode})`.
- `providers/s3.js` — the only code that knows Data is S3, and the only production user of the AWS SDK.

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

`AssumeRole` on `USER_DATA_ROLE_ARN` with session tag `username`; the role policy limits every action to
`users/${aws:PrincipalTag/username}/`. Mode `read` adds a session policy without put or delete. Credentials are
cached per user and mode and renewed within 15 minutes of expiry.

## Dev-env emulator

`docker-compose.override.yml` runs the adapter in emulator mode against its own `s3-emulator` service
(`rclone serve s3`, bucket `sepal-dev-user-data`, key `sepal-dev` / `sepal-dev-secret`). Emulator mode hands out
that fixed key: there is no prefix isolation and no read-only mode in dev-env.

## AWS resources

`hosting-services/aws/sepal/provision-user-data.yml` creates, per environment, the bucket
`sepal-<env>-user-data`, the IAM user `sepal-<env>-user-data` this module runs as, and the role of the same name
that user credentials are issued for.

**Before the first rollout of a build containing user-data to an environment**, run `provision-user-data.yml`,
create access keys for the IAM user, and put `USER_DATA_BUCKET`, `USER_DATA_ROLE_ARN`,
`USER_DATA_AWS_ACCESS_KEY_ID` and `USER_DATA_AWS_SECRET_ACCESS_KEY` in the env file (the playbook prints the bucket
and role ARN to use). Without them the container exits at boot. `user-data` is the last module in `deploy.yml` so
that such a failure leaves every other module updated.

On the very first provisioning run, IAM eventual consistency can reject the role's trust policy ("Invalid
principal") because it names the just-created IAM user; re-running the playbook fixes it.

`*.aws.integration.test.js` checks prefix isolation and read-only mode on that real bucket. It runs only with
`USER_DATA_AWS_ISOLATION_TEST=true`, in the test deployment:
`docker exec -e USER_DATA_AWS_ISOLATION_TEST=true user-data npm run test:aws`.
