import {DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, S3Client} from '@aws-sdk/client-s3'
import {AssumeRoleCommand, GetCallerIdentityCommand, STSClient} from '@aws-sdk/client-sts'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'

import {ClientException, ServerException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

import {contentDisposition} from '../contentDisposition.js'

const log = getLogger('s3')

const DURATION_SECONDS = 3600
const PROBE_DURATION_SECONDS = 900
const PROBE_USERNAME = 'sepal-boot-probe'
const RENEW_BEFORE_EXPIRY_MS = 15 * 60 * 1000
const MODES = ['read', 'readWrite']
const EMULATOR_SESSION_TOKEN = 'sepal-dev-emulator'
const USERNAME = /^[a-zA-Z_][a-zA-Z0-9]*$/

export const dataBucketName = deployEnvironment => `sepal-${deployEnvironment.toLowerCase()}-user-data`

// In AWS mode the boot fails unless the bucket and the role exist and the keys can use them.
export const createS3Provider = async (
    {region, bucket, accessKeyId, secretAccessKey, deployEnvironment, endpoint, emulator},
    {sts, s3} = {}
) => {
    const credentials = {accessKeyId, secretAccessKey}
    if (emulator) {
        const s3Client = s3 ?? new S3Client({region, credentials, endpoint, forcePathStyle: true})
        return new S3Provider({region, bucket, s3: s3Client, emulator: {endpoint, accessKeyId, secretAccessKey}})
    }
    const s3Client = s3 ?? new S3Client({region, credentials})
    const stsClient = sts ?? new STSClient({region, credentials})
    const roleArn = await resolveRoleArn(stsClient, deployEnvironment)
    await probeBucket(s3Client, bucket)
    await probeRole(stsClient, roleArn)
    return new S3Provider({region, bucket, s3: s3Client, sts: stsClient, roleArn})
}

const resolveRoleArn = async (sts, deployEnvironment) => {
    let identity
    try {
        identity = await sts.send(new GetCallerIdentityCommand({}))
    } catch (error) {
        throw new ServerException(`Cannot resolve the AWS account of the configured keys: ${error.message}`)
    }
    if (!identity.Arn.includes(':user/')) {
        throw new ServerException('user-data must run with an IAM user\'s keys; root credentials cannot assume roles')
    }
    return `arn:aws:iam::${identity.Account}:role/${dataBucketName(deployEnvironment)}`
}

const probeBucket = async (s3, bucket) => {
    try {
        await s3.send(new HeadBucketCommand({Bucket: bucket}))
    } catch (error) {
        throw new ServerException(`Cannot reach the Data bucket ${bucket} (${error.message || error.name}); run a rollout to provision it`)
    }
}

const probeRole = async (sts, roleArn) => {
    try {
        await sts.send(new AssumeRoleCommand({
            RoleArn: roleArn,
            RoleSessionName: 'user-data-boot-probe',
            DurationSeconds: PROBE_DURATION_SECONDS,
            Tags: [{Key: 'username', Value: PROBE_USERNAME}]
        }))
    } catch (error) {
        throw new ServerException(`Cannot assume the Data role ${roleArn} (${error.message || error.name}); run a rollout to provision it`)
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

    // With `before`, only objects last modified before then are erased.
    async erase(attachment, {before} = {}) {
        requireUsername(attachment.owner)
        for await (const {Contents = []} of this.#listPages({Prefix: attachment.location.prefix})) {
            const objects = Contents.filter(({LastModified}) => !before || LastModified < before)
            if (objects.length) {
                const {Errors} = await this.#s3.send(new DeleteObjectsCommand({
                    Bucket: this.#bucket,
                    Delete: {Objects: objects.map(({Key}) => ({Key})), Quiet: true}
                }))
                if (Errors?.length) {
                    throw new ServerException(`Cannot erase ${attachment.location.prefix}: ${Errors[0].Message}`)
                }
            }
        }
    }

    isEmulator() {
        return !!this.#emulator
    }

    // Entries directly below relPath; the emulator leaves the trailing slash off common prefixes.
    async list(attachment, relPath) {
        requireUsername(attachment.owner)
        requireRelPath(relPath, {allowRoot: true})
        const prefix = folderPrefix(attachment, relPath)
        const entries = []
        for await (const {Contents = [], CommonPrefixes = []} of this.#listPages({Prefix: prefix, Delimiter: '/'})) {
            entries.push(...CommonPrefixes.map(({Prefix}) => ({name: Prefix.slice(prefix.length).replace(/\/$/, ''), dir: true})))
            entries.push(...Contents
                .filter(({Key}) => Key !== prefix)
                .map(({Key, Size, LastModified}) => ({name: Key.slice(prefix.length), file: true, size: Size, mtime: LastModified.getTime()}))
            )
        }
        return entries
    }

    async downloadUrl(attachment, relPath, {expiresSeconds}) {
        const key = this.#fileKey(attachment, relPath)
        return getSignedUrl(
            this.#s3,
            new GetObjectCommand({
                Bucket: this.#bucket,
                Key: key,
                ResponseContentDisposition: contentDisposition(relPath.split('/').at(-1))
            }),
            {expiresIn: expiresSeconds}
        )
    }

    async download(attachment, relPath) {
        const {Body, ContentLength, ContentType} = await this.#s3.send(
            new GetObjectCommand({Bucket: this.#bucket, Key: this.#fileKey(attachment, relPath)})
        )
        return {stream: Body, size: ContentLength, contentType: ContentType}
    }

    // Removes the file at relPath, or else the folder and everything under it. S3 can hold a file and a folder of
    // the same name, which the file browser shows as one entry: one removal never takes both.
    async remove(attachment, relPath) {
        requireUsername(attachment.owner)
        requireRelPath(relPath)
        const key = attachment.location.prefix + relPath
        if (await this.#exists(key)) {
            await this.#deleteKeys([key], relPath)
            return
        }
        for await (const {Contents = []} of this.#listPages({Prefix: folderPrefix(attachment, relPath)})) {
            await this.#deleteKeys(Contents.map(({Key}) => Key), relPath)
        }
    }

    #fileKey(attachment, relPath) {
        requireUsername(attachment.owner)
        requireRelPath(relPath)
        return attachment.location.prefix + relPath
    }

    // The emulator fails to delete a key that does not exist, so check first. The exact key sorts before any
    // other key it prefixes.
    async #exists(key) {
        const {Contents = []} = await this.#s3.send(new ListObjectsV2Command({Bucket: this.#bucket, Prefix: key, MaxKeys: 1}))
        return Contents[0]?.Key === key
    }

    async #deleteKeys(keys, relPath) {
        if (!keys.length) {
            return
        }
        const {Errors} = await this.#s3.send(new DeleteObjectsCommand({
            Bucket: this.#bucket,
            Delete: {Objects: keys.map(Key => ({Key})), Quiet: true}
        }))
        if (Errors?.length) {
            throw new ServerException(`Cannot remove ${relPath}: ${Errors[0].Message}`)
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

const folderPrefix = ({location: {prefix}}, relPath) =>
    relPath ? `${prefix}${relPath}/` : prefix

const requireRelPath = (relPath, {allowRoot = false} = {}) => {
    const valid = typeof relPath === 'string'
        && (relPath === '' ? allowRoot : !relPath.includes('\\') && !relPath.includes('\0') && relPath.split('/').every(segment => segment && segment !== '..' && segment !== '.'))
    if (!valid) {
        throw new ClientException(`Not a path inside Data: ${relPath}`)
    }
}
