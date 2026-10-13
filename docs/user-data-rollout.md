# Rolling out user-data to an environment

The `user-data` module needs AWS resources and four settings in the environment's env file before it can start.
Do these steps once per environment (test, production, …), before the first build that contains `user-data` is
deployed there. Later rollouts need none of this.

Without these settings the `user-data` container exits at boot and the deploy stops there. `user-data` is the last
module in `hosting-services/aws/sepal/deploy.yml`, so every other module is updated by then.

**Don't use `-o rollout` for the first rollout.** It provisions and deploys in one go, which leaves no gap to add
the settings in step 3. Provision and deploy separately, as below.

## 1. Provision the AWS resources

```bash
bin/deploy -o provision -b <build> -c <config dir>
```

Run this with your usual deploy credentials (the `AWS_*` keys in the env file); they must be allowed to create IAM
users, roles and policies and S3 buckets. Provisioning runs `provision-user-data.yml`, which creates:

| Resource | Name |
|---|---|
| S3 bucket (private, encrypted, HTTPS only) | `sepal-<env>-user-data` |
| IAM user the `user-data` module runs as | `sepal-<env>-user-data` |
| IAM role that gives one user access to their own folder | `sepal-<env>-user-data` |

The role is how a user's tools get into the bucket without seeing anyone else's files. When a user's sandbox tools
(the `~/data` mount, rclone, GDAL, the AWS CLI) or one of their export tasks need S3 access, they ask `user-data`
for credentials. `user-data` assumes the role on that user's behalf and tags the session with their username.
AWS returns temporary keys, valid for an hour, that can read, write, delete and list only
`users/<username>/` in the bucket. The module's own IAM user can reach every user's folder, so its keys never
leave the `user-data` container.

`<env>` is `DEPLOY_ENVIRONMENT` from the env file, in lower case. The playbook ends by printing the two values
step 3 needs:

```
USER_DATA_BUCKET=sepal-<env>-user-data
USER_DATA_ROLE_ARN=arn:aws:iam::<account>:role/sepal-<env>-user-data
```

**On the very first run** the role can fail with `Invalid principal`. IAM hasn't yet propagated the IAM user it
created a moment earlier. Run the same command again; every step is safe to repeat.

The playbook stops before touching AWS if `DEPLOY_ENVIRONMENT` is empty, or if the env file already sets
`USER_DATA_BUCKET` to anything other than `sepal-<env>-user-data`. It never touches other buckets, such as the
existing `sepal-user-data`.

## 2. Create access keys for the module's IAM user

```bash
aws iam create-access-key --user-name sepal-<env>-user-data
```

Use the same AWS account as step 1. Keep `AccessKeyId` and `SecretAccessKey` from the output; the secret is shown
only once. Don't store them anywhere except the env file.

## 3. Add the settings to the env file

Append to `<config dir>/env`:

```bash
USER_DATA_BUCKET='sepal-<env>-user-data'
USER_DATA_ROLE_ARN='arn:aws:iam::<account>:role/sepal-<env>-user-data'
USER_DATA_AWS_ACCESS_KEY_ID='<AccessKeyId from step 2>'
USER_DATA_AWS_SECRET_ACCESS_KEY='<SecretAccessKey from step 2>'
```

None of these may be empty: the module refuses to start, and says which setting is missing.

## 4. Deploy

```bash
bin/deploy -o deploy -b <build> -c <config dir>
```

Check that the module is up on the main host:

```bash
docker ps --filter name=user-data --format '{{.Names}} {{.Status}}'   # user-data Up … (healthy)
docker logs user-data 2>&1 | grep 'Configuration loaded'             # no "(S3 emulator)" suffix
```

## 5. Check user isolation (test environment)

Run this once in the test environment, before the first production rollout, and again whenever the IAM policies
in `hosting-services/aws/sepal/user-data/` change. It is the only check that, on real AWS, one user's credentials
can't read, write, delete or list another user's files:

```bash
docker exec -e USER_DATA_AWS_ISOLATION_TEST=true user-data npm run test:aws
```

Every test must pass. The suite works under `users/isolationA/`, `users/isolationA2/` and `users/isolationB/`, and
deletes what it creates.

## Rotating the access keys

Create a new key (step 2), replace the two key settings in the env file (step 3), deploy (step 4), then delete the
old key with `aws iam delete-access-key --user-name sepal-<env>-user-data --access-key-id <old id>`.
