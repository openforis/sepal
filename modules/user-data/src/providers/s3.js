import {DeleteObjectsCommand, ListObjectsV2Command, S3Client} from '@aws-sdk/client-s3'
import {AssumeRoleCommand, GetCallerIdentityCommand, STSClient} from '@aws-sdk/client-sts'

import {ClientException, ServerException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

const log = getLogger('s3')

const DURATION_SECONDS = 3600
const RENEW_BEFORE_EXPIRY_MS = 15 * 60 * 1000
const MODES = ['read', 'readWrite']
const EMULATOR_SESSION_TOKEN = 'sepal-dev-emulator'
const USERNAME = /^[a-zA-Z_][a-zA-Z0-9]*$/

export const dataBucketName = deployEnvironment => `sepal-${deployEnvironment.toLowerCase()}-user-data`

export const createS3Provider = async (
    {region, bucket, accessKeyId, secretAccessKey, deployEnvironment, endpoint, emulator},
    {sts = new STSClient({region, credentials: {accessKeyId, secretAccessKey}})} = {}
) => {
    const credentials = {accessKeyId, secretAccessKey}
    const s3 = new S3Client({region, credentials, ...(emulator ? {endpoint, forcePathStyle: true} : {})})
    return emulator
        ? new S3Provider({region, bucket, s3, emulator: {endpoint, accessKeyId, secretAccessKey}})
        : new S3Provider({region, bucket, s3, sts, roleArn: await resolveRoleArn(sts, deployEnvironment)})
}

const resolveRoleArn = async (sts, deployEnvironment) => {
    try {
        const {Account} = await sts.send(new GetCallerIdentityCommand({}))
        return `arn:aws:iam::${Account}:role/${dataBucketName(deployEnvironment)}`
    } catch (error) {
        throw new ServerException(`Cannot resolve the AWS account of the configured keys: ${error.message}`)
    }
}

// Data on S3: every user's attachment is a prefix of one shared bucket. Credentials come from a role whose
// policy names the prefix through the `username` session tag, so they cannot reach another user's objects.
export class S3Provider {
    #sts
    #s3
    #bucket
    #roleArn
    #region
    #emulator
    #now
    #cache = new Map()

    constructor({sts, s3, bucket, roleArn, region, emulator, now = () => new Date()}) {
        this.#sts = sts
        this.#s3 = s3
        this.#bucket = bucket
        this.#roleArn = roleArn
        this.#region = region
        this.#emulator = emulator
        this.#now = now
    }

    async grantAccess(attachment, {mode, purpose, credentialsUrl, authorizationTokenFile}) {
        requireUsername(attachment.owner)
        requireMode(mode)
        const root = rootOf(attachment)
        if (purpose === 'task') {
            const credentials = await this.#issue(attachment.owner, mode)
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

    async measureUsage(attachment) {
        requireUsername(attachment.owner)
        let bytes = 0
        for await (const {Contents = []} of this.#listPages({Prefix: attachment.location.prefix})) {
            bytes += Contents.reduce((sum, {Size}) => sum + Size, 0)
        }
        return bytes
    }

    // The emulator (rclone) reports common prefixes without the trailing slash, so it is optional here.
    async owners() {
        const owners = []
        for await (const {CommonPrefixes = []} of this.#listPages({Prefix: 'users/', Delimiter: '/'})) {
            owners.push(...CommonPrefixes.map(({Prefix}) => Prefix.slice('users/'.length).replace(/\/$/, '')))
        }
        return owners.filter(owner => USERNAME.test(owner))
    }

    async erase(attachment) {
        requireUsername(attachment.owner)
        for await (const {Contents = []} of this.#listPages({Prefix: attachment.location.prefix})) {
            if (Contents.length) {
                const {Errors} = await this.#s3.send(new DeleteObjectsCommand({
                    Bucket: this.#bucket,
                    Delete: {Objects: Contents.map(({Key}) => ({Key})), Quiet: true}
                }))
                if (Errors?.length) {
                    throw new ServerException(`Cannot erase ${attachment.location.prefix}: ${Errors[0].Message}`)
                }
            }
        }
    }

    async * #listPages(params) {
        let ContinuationToken
        do {
            const page = await this.#s3.send(new ListObjectsV2Command({Bucket: this.#bucket, ...params, ContinuationToken}))
            yield page
            ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
        } while (ContinuationToken)
    }

    async #credentials(username, mode) {
        requireUsername(username)
        requireMode(mode)
        const key = `${username}:${mode}`
        const cached = this.#cache.get(key)
        if (cached && cached.expiration.getTime() - this.#now().getTime() > RENEW_BEFORE_EXPIRY_MS) {
            return cached
        }
        const credentials = await this.#issue(username, mode)
        this.#cache.set(key, credentials)
        return credentials
    }

    #issue(username, mode) {
        return this.#emulator
            ? this.#emulatorCredentials()
            : this.#assumeRole(username, mode)
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
            sessionToken: EMULATOR_SESSION_TOKEN,
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

const requireMode = mode => {
    if (!MODES.includes(mode)) {
        throw new ServerException(`Unknown access mode: ${mode}`)
    }
}

const requireUsername = username => {
    if (!USERNAME.test(username ?? '')) {
        throw new ClientException(`Not a username Data can be stored for: ${username}`)
    }
}
