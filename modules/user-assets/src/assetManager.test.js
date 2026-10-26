import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, mock, test} from 'node:test'

import {filter, firstValueFrom, map, of, Subject, throwError, timeout} from 'rxjs'

import {STree} from '#sepal/tree/sTree'

const storedAssets = new Map()
const setAssets = mock.fn(async (username, assets) => {
    storedAssets.set(username, {assets, timestamp: Date.now()})
})
const scanNode$ = mock.fn((_username, path) => of(STree.createNode(path)))
const scanTree$ = mock.fn(() => of(treeWithAsset()))

mock.module('./asset.js', {namedExports: {
    deleteAsset$: () => of({}),
    createFolder$: () => of({})
}})
mock.module('./assetScanner.js', {namedExports: {busy$: new Subject(), isBusy: () => false, scanNode$, scanTree$}})
mock.module('./assetStore.js', {namedExports: {
    getAssets: async username => storedAssets.get(username) ?? {},
    setAssets,
    expireAssets: async () => {},
    removeAssets: async () => {}
}})
mock.module('./userStore.js', {namedExports: {
    getUser: async username => ({username}),
    setUser: async () => {},
    removeUser: async () => {}
}})
mock.module('./config.js', {namedExports: {pollIntervalMilliseconds: 60 * 60 * 1000}})

const {createAssetManager} = await import('./assetManager.js')

const gatewayDown = () => throwError(() => new Error('gee unavailable'))
const redisDown = async () => {
    throw new Error('redis unavailable')
}

let stop$
let sent$
let assetManager

beforeEach(() => {
    storedAssets.clear()
    stop$ = new Subject()
    sent$ = new Subject()
    assetManager = createAssetManager({send: message => sent$.next(message), stop$})
})

afterEach(() => stop$.next())

describe('remove', () => {
    test('keeps deleting assets after rescanning a parent folder fails', async () => {
        const username = 'alice'
        const updatedNode = subscribeToUpdatedNode(username)
        scanNode$.mock.mockImplementationOnce(gatewayDown)

        assetManager.remove({...subscription(username), paths: [['projects', 'a', 'first']]})
        await settle()
        assetManager.remove({...subscription(username), paths: [['projects', 'b', 'second']]})

        assert.deepEqual(STree.getPath(await updatedNode), ['projects', 'b'])
    })
})

describe('createFolder', () => {
    test('keeps creating folders after storing the rescanned folder fails', async () => {
        const username = 'alice'
        storedAssets.set(username, {assets: treeWithAsset(), timestamp: Date.now()})
        const updatedNode = subscribeToUpdatedNode(username)
        setAssets.mock.mockImplementationOnce(redisDown)

        assetManager.createFolder({...subscription(username), path: ['projects', 'a', 'first']})
        await settle()
        assetManager.createFolder({...subscription(username), path: ['projects', 'b', 'second']})

        assert.deepEqual(STree.getPath(await updatedNode), ['projects', 'b'])
    })
})

describe('userUp', () => {
    test('keeps monitoring other users after storing one user\'s assets fails', async () => {
        const updatedTree = subscribeToUpdatedTree('bob')
        setAssets.mock.mockImplementationOnce(redisDown)

        assetManager.userUp(userWithValidGoogleTokens('alice'))
        await settle()
        assetManager.userUp(userWithValidGoogleTokens('bob'))

        assert.ok(!STree.isLeaf(await updatedTree))
    })
})

const subscription = username =>
    ({username, clientId: `client-${username}`, subscriptionId: `subscription-${username}`})

const subscribeToUpdatedNode = username => {
    const updatedNode = firstValueFrom(sentData(username).pipe(
        filter(({node}) => node),
        map(({node}) => node)
    ))
    assetManager.subscriptionUp(subscription(username))
    return updatedNode
}

const subscribeToUpdatedTree = username => {
    const updatedTree = firstValueFrom(sentData(username).pipe(
        filter(({tree}) => tree && !STree.isLeaf(tree)),
        map(({tree}) => tree)
    ))
    assetManager.subscriptionUp(subscription(username))
    return updatedTree
}

const sentData = username =>
    sent$.pipe(
        filter(({subscriptionId}) => subscriptionId === subscription(username).subscriptionId),
        map(({data}) => data),
        timeout(1000)
    )

const treeWithAsset = () => {
    const tree = STree.createRoot()
    STree.addChildNode(tree, 'projects', {type: 'Folder'})
    return tree
}

const userWithValidGoogleTokens = username => ({
    username,
    googleTokens: {projectId: 'project', accessToken: 'token', accessTokenExpiryDate: Date.now() + 60 * 60 * 1000}
})

const settle = () =>
    new Promise(resolve => setTimeout(resolve, 10))
