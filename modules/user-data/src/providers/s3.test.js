import {ClientException, ServerException} from '#sepal/exception'

import {Attachments} from '../attachments.js'
import {createS3Provider, dataBucketName, S3Provider} from './s3.js'

describe('dataBucketName', () => {
    it.each([
        ['PROD', 'sepal-prod-user-data'],
        ['Test', 'sepal-test-user-data']
    ])('derives the bucket and role name of environment %s', (environment, name) => {
        expect(dataBucketName(environment)).toBe(name)
    })
})

describe('createS3Provider in AWS mode', () => {
    it('issues credentials for the role named after the environment in the keys\' account', async () => {
        const sts = fakeSts({account: '123456789012'})
        const provider = await createS3Provider(AWS_CONFIG, {sts, s3: fakeS3()})

        await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        expect(sts.requests.at(-1)).toMatchObject({RoleArn: ROLE_ARN, Tags: [{Key: 'username', Value: 'alice'}]})
    })

    it('fails startup with a clear message when the caller identity cannot be resolved', async () => {
        const sts = fakeSts({identityFails: true})

        await expect(createS3Provider(AWS_CONFIG, {sts, s3: fakeS3()})).rejects.toThrow(/Cannot resolve the AWS account/)
    })

    it('checks at startup that the bucket can be reached', async () => {
        const s3 = fakeS3()

        await createS3Provider(AWS_CONFIG, {sts: fakeSts(), s3})

        expect(s3.requests).toEqual([{command: 'HeadBucketCommand', input: {Bucket: BUCKET}}])
    })

    it('fails startup naming the bucket when it cannot be reached', async () => {
        const s3 = fakeS3({headFails: true})

        await expect(createS3Provider(AWS_CONFIG, {sts: fakeSts(), s3}))
            .rejects.toThrow(`Cannot reach the Data bucket ${BUCKET} (NotFound); run a rollout to provision it`)
    })

    it('checks at startup that the role can be assumed with a short session tagged with a username', async () => {
        const sts = fakeSts()

        await createS3Provider(AWS_CONFIG, {sts, s3: fakeS3()})

        expect(sts.requests).toEqual([expect.objectContaining({
            RoleArn: ROLE_ARN,
            DurationSeconds: 900,
            Tags: [{Key: 'username', Value: 'sepal-boot-probe'}]
        })])
    })

    it('fails startup naming the role when it cannot be assumed', async () => {
        const sts = fakeSts({failures: 1})

        await expect(createS3Provider(AWS_CONFIG, {sts, s3: fakeS3()}))
            .rejects.toThrow(`Cannot assume the Data role ${ROLE_ARN} (Throttled); run a rollout to provision it`)
    })
})

describe('createS3Provider in emulator mode', () => {
    it('checks neither bucket nor role at startup', async () => {
        const sts = fakeSts()
        const s3 = fakeS3()

        await createS3Provider({...AWS_CONFIG, ...EMULATOR, emulator: true}, {sts, s3})

        expect(s3.requests).toEqual([])
        expect(sts.requests).toEqual([])
    })
})

describe('createS3Provider with root credentials', () => {
    it('fails startup because root cannot assume roles', async () => {
        const sts = fakeSts({arn: 'arn:aws:iam::123456789012:root'})

        await expect(createS3Provider(AWS_CONFIG, {sts, s3: fakeS3()}))
            .rejects.toThrow('user-data must run with an IAM user\'s keys; root credentials cannot assume roles')
    })
})

describe('erase', () => {
    it('erases only the objects last modified before the given time', async () => {
        const s3 = fakeS3({objects: [
            {Key: 'users/alice/old.txt', LastModified: new Date('2026-10-13T09:59:59Z')},
            {Key: 'users/alice/new.txt', LastModified: new Date('2026-10-13T10:00:00Z')}
        ]})
        const provider = new S3Provider({s3, bucket: BUCKET, region: REGION})

        await provider.erase(attachment('alice'), {before: new Date('2026-10-13T10:00:00Z')})

        expect(s3.deleted).toEqual(['users/alice/old.txt'])
    })
})

describe('credentials', () => {
    it('are issued through a role session tagged with the attachment owner', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        expect(sts.requests).toEqual([expect.objectContaining({
            RoleArn: ROLE_ARN,
            DurationSeconds: 3600,
            Tags: [{Key: 'username', Value: 'alice'}]
        })])
        expect(sts.requests[0].Policy).toBeUndefined()
    })

    it('in read mode carry a session policy that allows no writes or deletes', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        await provider.credentials(attachment('alice'), {mode: 'read'})

        const actions = JSON.parse(sts.requests[0].Policy).Statement.flatMap(statement => statement.Action)
        expect(actions).toEqual(expect.arrayContaining(['s3:GetObject', 's3:ListBucket']))
        expect(actions.filter(action => /Put|Delete|\*/.test(action))).toEqual([])
    })

    it('are answered in the AWS container-credentials format', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        const credentials = await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        const [issued] = sts.issued
        expect(credentials).toEqual({
            AccessKeyId: issued.AccessKeyId,
            SecretAccessKey: issued.SecretAccessKey,
            Token: issued.SessionToken,
            Expiration: issued.Expiration.toISOString()
        })
    })

    it('are reused while more than 15 minutes from expiry', async () => {
        const clock = fakeClock()
        const sts = fakeSts({clock})
        const provider = awsProvider({sts, clock})
        await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        clock.advance(HOUR - 15 * MINUTE - SECOND)
        await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        expect(sts.requests).toHaveLength(1)
    })

    it('are renewed once within 15 minutes of expiry', async () => {
        const clock = fakeClock()
        const sts = fakeSts({clock})
        const provider = awsProvider({sts, clock})
        await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        clock.advance(HOUR - 15 * MINUTE)
        const renewed = await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        expect(sts.requests).toHaveLength(2)
        expect(renewed.AccessKeyId).toBe(sts.issued[1].AccessKeyId)
    })

    it('are kept apart per user and per mode', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        await provider.credentials(attachment('alice'), {mode: 'readWrite'})
        await provider.credentials(attachment('alice'), {mode: 'read'})
        await provider.credentials(attachment('bob'), {mode: 'readWrite'})

        expect(sts.requests).toHaveLength(3)
    })

    it('are issued again after a failure, which is passed on rather than cached', async () => {
        const sts = fakeSts({failures: 1})
        const provider = awsProvider({sts})

        await expect(provider.credentials(attachment('alice'), {mode: 'readWrite'})).rejects.toThrow('Throttled')
        const credentials = await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        expect(sts.requests).toHaveLength(2)
        expect(credentials.AccessKeyId).toBe(sts.issued[0].AccessKeyId)
    })

    it('are refused, without a role session, for a username that is not safe in a key', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        await expect(provider.credentials(attachment('a/b'), {mode: 'readWrite'})).rejects.toThrow(ClientException)
        expect(sts.requests).toEqual([])
    })

    it.each([undefined, 'readonly'])('are refused, without a role session, for the unknown mode %s', async mode => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        await expect(provider.credentials(attachment('alice'), {mode})).rejects.toThrow(ServerException)
        expect(sts.requests).toEqual([])
    })

    it('in emulator mode are the emulator key, without a role session', async () => {
        const provider = emulatorProvider()

        const credentials = await provider.credentials(attachment('alice'), {mode: 'readWrite'})

        expect(credentials).toMatchObject({AccessKeyId: EMULATOR.accessKeyId, SecretAccessKey: EMULATOR.secretAccessKey})
        expect(credentials.Token).toEqual(expect.any(String))
        expect(credentials.Token).not.toBe('')
        expect(Date.parse(credentials.Expiration)).toBeGreaterThan(Date.parse(NOW))
    })
})

describe('grantAccess', () => {
    it('lets sandboxes and mounts fetch credentials from the credentials endpoint themselves', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        const access = await provider.grantAccess(attachment('alice'), request({purpose: 'mount'}))

        expect(access.rclone).toEqual({
            type: 's3',
            root: `${BUCKET}/users/alice`,
            options: {provider: 'AWS', region: REGION, env_auth: 'true', no_check_bucket: 'true'}
        })
        expect(access.env).toMatchObject({
            AWS_CONTAINER_CREDENTIALS_FULL_URI: CREDENTIALS_URL,
            AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: TOKEN_FILE,
            AWS_REGION: REGION
        })
        expect(sts.requests).toEqual([])
    })

    it('names the user prefix for native tools', async () => {
        const provider = awsProvider({sts: fakeSts()})

        const {env} = await provider.grantAccess(attachment('alice'), request({purpose: 'sandbox'}))

        expect(env.SEPAL_DATA_URL).toBe(`s3://${BUCKET}/users/alice/`)
        expect(env.SEPAL_DATA_VSI).toBe(`/vsis3/${BUCKET}/users/alice`)
    })

    it('gives tasks one-hour credentials inline in the rclone options', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        const access = await provider.grantAccess(attachment('alice'), request({purpose: 'task'}))

        const [issued] = sts.issued
        expect(access.rclone.options).toEqual({
            provider: 'AWS',
            region: REGION,
            env_auth: 'false',
            no_check_bucket: 'true',
            access_key_id: issued.AccessKeyId,
            secret_access_key: issued.SecretAccessKey,
            session_token: issued.SessionToken
        })
        expect(access.env).toEqual({})
    })

    it('gives tasks fresh credentials rather than ones already cached for the endpoint', async () => {
        const clock = fakeClock()
        const sts = fakeSts({clock})
        const provider = awsProvider({sts, clock})
        await provider.credentials(attachment('alice'), {mode: 'readWrite'})
        clock.advance(40 * MINUTE)

        const access = await provider.grantAccess(attachment('alice'), request({purpose: 'task'}))

        expect(sts.requests).toHaveLength(2)
        expect(access.rclone.options.access_key_id).toBe(sts.issued[1].AccessKeyId)
    })

    it.each([undefined, 'readonly'])('refuses the unknown mode %s without a role session', async mode => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        await expect(provider.grantAccess(attachment('alice'), {...request({purpose: 'task'}), mode})).rejects.toThrow(ServerException)
        expect(sts.requests).toEqual([])
    })

    it('scopes task credentials to the requested mode', async () => {
        const sts = fakeSts()
        const provider = awsProvider({sts})

        await provider.grantAccess(attachment('alice'), request({purpose: 'task', mode: 'read'}))

        const actions = JSON.parse(sts.requests[0].Policy).Statement.flatMap(statement => statement.Action)
        expect(actions).toEqual(expect.arrayContaining(['s3:GetObject']))
        expect(actions.filter(action => /Put|Delete|\*/.test(action))).toEqual([])
    })

    it('in emulator mode points rclone and native tools at the emulator', async () => {
        const provider = emulatorProvider()

        const access = await provider.grantAccess(attachment('alice'), request({purpose: 'sandbox'}))

        expect(access.rclone.options).toMatchObject({provider: 'Other', endpoint: EMULATOR.endpoint})
        expect(access.env).toMatchObject({
            AWS_ENDPOINT_URL: EMULATOR.endpoint,
            AWS_S3_ENDPOINT: 's3-emulator:8080',
            AWS_HTTPS: 'NO',
            AWS_VIRTUAL_HOSTING: 'FALSE'
        })
    })
})

const BUCKET = 'sepal-test-user-data'
const REGION = 'eu-west-1'
const ROLE_ARN = 'arn:aws:iam::123456789012:role/sepal-test-user-data'
const CREDENTIALS_URL = 'https://sepal.example.org/api/user-data/attachments/data/credentials'
const TOKEN_FILE = '/var/run/sepal-data-token'
const EMULATOR = {endpoint: 'http://s3-emulator:8080', accessKeyId: 'sepal-dev', secretAccessKey: 'sepal-dev-secret'}
const NOW = '2026-10-12T10:00:00.000Z'
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const AWS_CONFIG = {region: REGION, accessKeyId: 'key', secretAccessKey: 'secret', deployEnvironment: 'Test', bucket: BUCKET, emulator: false}

const attachment = owner => new Attachments({bucket: BUCKET}).get(owner, 'data')

const request = ({purpose, mode = 'readWrite'}) =>
    ({purpose, mode, credentialsUrl: CREDENTIALS_URL, authorizationTokenFile: TOKEN_FILE})

const awsProvider = ({sts, clock = fakeClock()}) =>
    new S3Provider({sts, roleArn: ROLE_ARN, region: REGION, now: clock.now})

const emulatorProvider = () =>
    new S3Provider({region: REGION, emulator: EMULATOR, now: fakeClock().now})

const fakeClock = () => {
    let time = Date.parse(NOW)
    return {
        now: () => new Date(time),
        advance: ms => {
            time += ms
        }
    }
}

const fakeS3 = ({headFails = false, objects = []} = {}) => {
    const s3 = {
        requests: [],
        deleted: [],
        send: async command => {
            const name = command.constructor.name
            if (name === 'ListObjectsV2Command') {
                return {Contents: objects, IsTruncated: false}
            }
            if (name === 'DeleteObjectsCommand') {
                s3.deleted.push(...command.input.Delete.Objects.map(({Key}) => Key))
                return {}
            }
            s3.requests.push({command: name, input: command.input})
            if (headFails) {
                throw Object.assign(new Error(''), {name: 'NotFound'})
            }
            return {}
        }
    }
    return s3
}

const fakeSts = ({clock = fakeClock(), failures = 0, account = '123456789012', arn = `arn:aws:iam::${account}:user/deployer`, identityFails = false} = {}) => {
    const requests = []
    const issued = []
    let remainingFailures = failures
    return {
        requests,
        issued,
        send: async command => {
            if (command.constructor.name === 'GetCallerIdentityCommand') {
                if (identityFails) {
                    throw new Error('denied')
                }
                return {Account: account, Arn: arn}
            }
            requests.push(command.input)
            if (remainingFailures > 0) {
                remainingFailures--
                throw Object.assign(new Error('Throttled'), {name: 'Throttling'})
            }
            const credentials = {
                AccessKeyId: `ASIA${issued.length}`,
                SecretAccessKey: `secret-${issued.length}`,
                SessionToken: `token-${issued.length}`,
                Expiration: new Date(clock.now().getTime() + HOUR)
            }
            issued.push(credentials)
            return {Credentials: credentials}
        }
    }
}
