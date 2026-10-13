# Rolling out user-data

`user-data` needs no preparation per environment: a normal rollout provisions what it needs and then deploys it.

```bash
bin/deploy -o rollout -b <build> -c <config dir>
```

## What provisioning creates

Every rollout's provisioning step runs `hosting-services/aws/sepal/provision-user-data.yml`. Every step is safe to
repeat, so the first rollout creates these resources and later rollouts keep them in line with the playbook:

| Resource | Name |
|---|---|
| S3 bucket (private, encrypted, HTTPS only) | `sepal-<env>-user-data` |
| IAM role that gives one user access to their own folder | `sepal-<env>-user-data` |

`<env>` is `DEPLOY_ENVIRONMENT` from the env file, in lower case.

When a user's tools (the `~/data` mount, export tasks) need S3 access, they ask `user-data` for credentials.
`user-data` assumes the role on that user's behalf, tagging the session with their username. AWS returns temporary
keys, valid for an hour, that can only read, write, delete and list `users/<username>/` in the bucket.

## Credentials

`user-data` uses the environment's regular `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` from the
env file. It derives the bucket name from `DEPLOY_ENVIRONMENT` and the role from the account those keys belong to.
No other settings are needed.

- The keys must belong to an IAM user, not the AWS root user: root credentials cannot assume roles.
- The role trusts the IAM user that ran provisioning. Rotating that user's access keys changes nothing. To switch to
  a different IAM user, put its keys in the env file and run a rollout (not a bare deploy): provisioning updates
  the role's trust before `user-data` starts with the new keys.

## Permissions the keys need

The same keys run provisioning and `user-data`, so they need both sets of permissions.

Provisioning:

- create and update the S3 bucket, its bucket policy and its lifecycle configuration;
- create the IAM role and put its policies (trust and permissions);
- `sts:GetCallerIdentity`.

`user-data` at runtime:

- `sts:GetCallerIdentity`;
- `sts:AssumeRole` and `sts:TagSession` on the role;
- `s3:ListBucket` on the bucket;
- `s3:GetObject` and `s3:DeleteObject` on `users/*` in the bucket.

A provisioning run with different keys rewrites the role's trust to their IAM user. Restart `user-data` with those
keys afterwards: until then it keeps running with keys the role no longer trusts. At startup `user-data` checks that
it can reach the bucket and assume the role, so a mismatch stops the boot instead of failing users later.

## Deploy without provisioning

`-o deploy` alone works for any environment that has been rolled out at least once with this build or later. On an
environment that never had a rollout including `user-data`, the bucket and role don't exist yet. In that case
`user-data` fails to start, and the modules deployed after it (`gui`, `ssh-gateway`, `terminal`, `gateway`,
`caddy`) keep their previous version. Run a rollout instead.

## Check user isolation (test environment)

Run this once in the test environment, before the first production rollout, and again whenever the IAM policies in
`hosting-services/aws/sepal/user-data/` change. It is the only check that, on real AWS, one user's credentials can't
read, write, delete or list another user's files. Run it on the main host:

```bash
docker exec -e USER_DATA_AWS_ISOLATION_TEST=true user-data npm run test:aws
```

Every test must pass. The suite works under `users/isolationA/`, `users/isolationA2/` and `users/isolationB/`, and
deletes what it creates.

## Check downloads (test environment)

Run this once in the test environment, before the first production rollout, and again whenever the bucket policy or
the download route changes. The emulator in dev-env streams downloads, so only real AWS exercises the presigned URL.

1. In the GUI file browser, download a file from Data. The request to `/api/user-data/attachments/data/download`
   answers 302 to a presigned HTTPS URL on the bucket, and the browser saves the file under its own name. This also
   shows that the bucket's HTTPS-only policy (`aws:SecureTransport`) lets the presigned URL through.
2. Copy the URL from the 302 and open it again after 15 minutes: S3 refuses it as expired (403).

## Sessions running across the first rollout

On the rollout that first ships Data, sessions started before the rollout have no Data mount. The new `user-files`
moves a user's non-empty `~/data` to `~/data.local` and emails the user the first time their home is listed in the
file browser, which can happen while such a session is still using `~/data`. Close running sessions as part of that
rollout, or warn users beforehand.
