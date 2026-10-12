import {AssumeRoleCommand, STSClient} from '@aws-sdk/client-sts'

import {ClientException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

const log = getLogger('s3')

const DURATION_SECONDS = 3600
const RENEW_BEFORE_EXPIRY_MS = 15 * 60 * 1000
const USERNAME = /^[a-zA-Z_][a-zA-Z0-9]*$/

export const createS3Provider = ({region, roleArn, accessKeyId, secretAccessKey, endpoint, emulator}) =>
    emulator
        ? new S3Provider({region, emulator: {endpoint, accessKeyId, secretAccessKey}})
        : new S3Provider({
            region,
            roleArn,
            sts: new STSClient({region, credentials: {accessKeyId, secretAccessKey}})
        })

// Data on S3: every user's attachment is a prefix of one shared bucket. Credentials come from a role whose
// policy names the prefix through the `username` session tag, so they cannot reach another user's objects.
export class S3Provider {
    #sts
    #roleArn
    #region
    #emulator
    #now
    #cache = new Map()

    constructor({sts, roleArn, region, emulator, now = () => new Date()}) {
        this.#sts = sts
        this.#roleArn = roleArn
        this.#region = region
        this.#emulator = emulator
        this.#now = now
    }

    async grantAccess(attachment, {mode, purpose, credentialsUrl, authorizationTokenFile}) {
        requireUsername(attachment.owner)
        const root = rootOf(attachment)
        if (purpose === 'task') {
            const credentials = await this.#credentials(attachment.owner, mode)
            return {
                rclone: {type: 's3', root, options: {...this.#rcloneOptions('false'), ...rcloneCredentials(credentials)}},
                env: {}
            }
        }
        return {
            rclone: {type: 's3', root, options: this.#rcloneOptions('true')},
            env: {
                AWS_CONTAINER_CREDENTIALS_FULL_URI: credentialsUrl,
                AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: authorizationTokenFile,
                AWS_REGION: this.#region,
                SEPAL_DATA_URL: `s3://${root}/`,
                SEPAL_DATA_VSI: `/vsis3/${root}`,
                ...this.#emulatorEnv()
            }
        }
    }

    async credentials(attachment, {mode}) {
        const {accessKeyId, secretAccessKey, sessionToken, expiration} = await this.#credentials(attachment.owner, mode)
        return {
            AccessKeyId: accessKeyId,
            SecretAccessKey: secretAccessKey,
            Token: sessionToken,
            Expiration: expiration.toISOString()
        }
    }

    async #credentials(username, mode) {
        requireUsername(username)
        const key = `${username}:${mode}`
        const cached = this.#cache.get(key)
        if (cached && cached.expiration.getTime() - this.#now().getTime() > RENEW_BEFORE_EXPIRY_MS) {
            return cached
        }
        const credentials = this.#emulator
            ? this.#emulatorCredentials()
            : await this.#assumeRole(username, mode)
        this.#cache.set(key, credentials)
        return credentials
    }

    async #assumeRole(username, mode) {
        const {Credentials} = await this.#sts.send(new AssumeRoleCommand({
            RoleArn: this.#roleArn,
            RoleSessionName: `user-data-${username}`,
            DurationSeconds: DURATION_SECONDS,
            Tags: [{Key: 'username', Value: username}],
            Policy: mode === 'read' ? JSON.stringify(READ_ONLY_SESSION_POLICY) : undefined
        }))
        log.debug(() => `Issued ${mode} credentials for ${username} until ${Credentials.Expiration.toISOString()}`)
        return {
            accessKeyId: Credentials.AccessKeyId,
            secretAccessKey: Credentials.SecretAccessKey,
            sessionToken: Credentials.SessionToken,
            expiration: Credentials.Expiration
        }
    }

    #emulatorCredentials() {
        return {
            accessKeyId: this.#emulator.accessKeyId,
            secretAccessKey: this.#emulator.secretAccessKey,
            expiration: new Date(this.#now().getTime() + DURATION_SECONDS * 1000)
        }
    }

    #rcloneOptions(envAuth) {
        return this.#emulator
            ? {provider: 'Other', endpoint: this.#emulator.endpoint, region: this.#region, env_auth: envAuth, no_check_bucket: 'true'}
            : {provider: 'AWS', region: this.#region, env_auth: envAuth, no_check_bucket: 'true'}
    }

    // GDAL takes the endpoint as host:port plus separate flags; the AWS CLI and SDKs take the URL.
    #emulatorEnv() {
        if (!this.#emulator) {
            return {}
        }
        const url = new URL(this.#emulator.endpoint)
        return {
            AWS_ENDPOINT_URL: this.#emulator.endpoint,
            AWS_S3_ENDPOINT: url.host,
            AWS_HTTPS: url.protocol === 'https:' ? 'YES' : 'NO',
            AWS_VIRTUAL_HOSTING: 'FALSE'
        }
    }
}

// Intersected with the role policy, so it can only narrow what the role allows.
const READ_ONLY_SESSION_POLICY = {
    Version: '2012-10-17',
    Statement: [{
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'],
        Resource: '*'
    }]
}

const rootOf = ({location: {bucket, prefix}}) =>
    `${bucket}/${prefix.replace(/\/$/, '')}`

const rcloneCredentials = ({accessKeyId, secretAccessKey, sessionToken}) => ({
    access_key_id: accessKeyId,
    secret_access_key: secretAccessKey,
    ...(sessionToken ? {session_token: sessionToken} : {})
})

const requireUsername = username => {
    if (!USERNAME.test(username ?? '')) {
        throw new ClientException(`Not a username Data can be stored for: ${username}`)
    }
}
