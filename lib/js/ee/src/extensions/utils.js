import _ from 'lodash'
import {catchError, concat, concatMap, concatWith, EMPTY, ignoreElements, map, mergeMap, of, switchMap, toArray} from 'rxjs'

import {isWithinAssetPropertyLimit} from '#sepal/earthEngineAssetProperties'
import {LibraryTransport} from '#sepal/ee/transport/libraryTransport'
import {getLogger} from '#sepal/log'
import {swallow} from '#sepal/rxjs'

const log = getLogger('ee')

const TYPE_MAP = {
    'FOLDER': 'Folder',
    'IMAGE': 'Image',
    'IMAGE_COLLECTION': 'ImageCollection',
    'TABLE': 'Table',
    'CLASSIFIER': 'Classifier',
}

const FOLDER_MATCHER = /(projects\/.*?\/assets)\/(.*)/

// Each Earth Engine request goes through the installed transport: the client library's own unless another is
// installed with setTransport. What is composed out of several requests - paging, recursion, folder paths -
// is composed here, the same way over either.
export default ee => {
    const library = new LibraryTransport(ee)
    let transport = library

    const setTransport = newTransport => {
        transport = newTransport
    }

    const getInfo$ = (eeObject, description, maxRetries) =>
        transport.getInfo$(eeObject, description, maxRetries)

    const getMap$ = (eeObject, visParams, description, maxRetries) =>
        transport.getMap$(eeObject, visParams, description, maxRetries)

    const getAsset$ = (eeId, maxRetries) =>
        transport.getAsset$(eeId, maxRetries)

    const listBuckets$ = (projectId, maxRetries) =>
        transport.listBuckets$(projectId, maxRetries)

    const listOperations$ = (limit, maxRetries) =>
        transport.listOperations$(limit, maxRetries)

    const deleteAsset$ = (eeId, maxRetries) =>
        transport.deleteAsset$(eeId, maxRetries)

    const renameAsset$ = (eeSourceId, eeDestinationId, maxRetries) =>
        transport.renameAsset$(eeSourceId, eeDestinationId, maxRetries)

    const createImageCollection$ = (eeId, properties, maxRetries) =>
        transport.createImageCollection$(eeId, properties, maxRetries)

    const getTaskStatus$ = (taskId, description, maxRetries) =>
        transport.getTaskStatus$(taskId, description, maxRetries)

    const cancelTask$ = (taskId, description, maxRetries) =>
        transport.cancelTask$(taskId, description, maxRetries)

    const startTableExport$ = (task, description) =>
        transport.startTableExport$(task, description)

    const startImageExport$ = (task, description) =>
        transport.startImageExport$(task, description)

    const setAssetIamPolicy$ = (eeId, policy, maxRetries) =>
        transport.setAssetIamPolicy$(eeId, policy, maxRetries)

    const replaceAssetProperties$ = (eeId, properties, maxRetries = 0) =>
        getAsset$(eeId, maxRetries).pipe(
            switchMap(asset => {
                const validProperties = _.pickBy(properties, (value, key) => _.isNumber(value) || isValidPropertyString({value, key}))
                const currentKeys = Object.keys(asset.properties)
                const newKeys = Object.keys(validProperties)
                currentKeys.forEach(key => newKeys.includes(key) || (validProperties[key] = undefined))
                return transport.setAssetProperties$(eeId, validProperties, maxRetries)
            })
        )

    // What Earth Engine keeps: a larger string is rejected by setAssetProperties, which would take the whole
    // write down with it.
    const isValidPropertyString = ({value, key}) =>
        _.isString(value) && key !== 'system:index' && isWithinAssetPropertyLimit(value)

    const listAssets$ = (parentEEId, maxRetries) => {
        const list$ = pageToken => transport.listAssetsPage$(parentEEId, pageToken, maxRetries).pipe(
            map(({nextPageToken, assets}) => ({
                nextPageToken,
                assets: assets.map(({type, ...asset}) => ({type: TYPE_MAP[type], ...asset}))
            })),
            catchError(error => {
                if (error.cause?.startsWith('Google Earth Engine API has not been enabled in project:')) {
                    log.warn(`Cannot list assets for ${parentEEId}.`)
                } else {
                    log.warn(`Error while trying to list assets for ${parentEEId}.`, error)
                }
                return of({assets: []})
            }),
            switchMap(({nextPageToken, assets}) =>
                nextPageToken
                    ? concat(of(assets), list$(nextPageToken))
                    : of(assets)
            ),
            toArray(),
            map(array => array.flat())
        )
        return list$()
    }

    const deleteAssetRecursive$ = (eeId, {type, include = ['Folder', 'Image', 'ImageCollection', 'Table', 'Classifier']} = {}) =>
        type
            ? ['Folder', 'ImageCollection'].includes(type)
                ? listAssets$(eeId).pipe(
                    switchMap(nodes => of(...nodes)),
                    mergeMap(({id, type}) => deleteAssetRecursive$(id, {type, include})),
                    concatWith(deleteAsset$(eeId)),
                    swallow()
                )
                : deleteAsset$(eeId).pipe(
                    swallow()
                )
            : getAsset$(eeId).pipe(
                switchMap(({id, type}) => id && include.includes(type)
                    ? deleteAssetRecursive$(id, {type})
                    : EMPTY
                )
            )

    const createParentFolder$ = (eeId, maxRetries = 0) =>
        of(...getFolders(eeId)).pipe(
            concatMap(folder => {
                const [_ignore, parentId, assetId] = folder.match(FOLDER_MATCHER)
                return transport.ensureAssetFolder$(parentId, assetId, maxRetries)
            }),
            ignoreElements()
        )

    const createFolder$ = (eeId, maxRetries = 0) =>
        createParentFolder$(`${eeId}/`, maxRetries)

    const sepal = {
        getAuthType: () => library.getAuthType(),
        setAuthType: authType => library.setAuthType(authType)
    }

    const isNull = o =>
        ee.List([o]).map(o => o, true).size().eq(0)

    const mosaic = collection => {
        const bandNames = collection
            .merge(ee.ImageCollection([ee.Image([])]))
            .first()
            .bandNames()
        const footprint = ee.Algorithms.If(
            collection.get('system:footprint'),
            collection.get('system:footprint'),
            collection.geometry().bounds()
        )
        return collection
            .select(bandNames)
            .mosaic()
            .set('system:footprint', footprint)
    }

    return {
        setMaxRetries: maxRetries => library.setMaxRetries(maxRetries),
        setUsername: username => library.setUsername(username),
        $: operation => library.$(operation),
        setTransport,
        listBuckets$,
        listAssets$,
        listOperations$,
        getAsset$,
        replaceAssetProperties$,
        deleteAsset$,
        deleteAssetRecursive$,
        createParentFolder$,
        createFolder$,
        renameAsset$,
        createImageCollection$,
        getInfo$,
        getMap$,
        getTaskStatus$,
        cancelTask$,
        startTableExport$,
        startImageExport$,
        setAssetIamPolicy$,
        isNull,
        mosaic,
        sepal
    }
}

const getRoot = id => {
    var match = id.match(/^(projects\/.*?\/assets)\/.*/)
        || id.match(/^(users\/.*?)\/.*/)
    return match && match[1]
}

const getProjectAssetId = id =>
    id.startsWith('users/')
        ? `projects/earthengine-legacy/assets/${id}`
        : id

const getFolders = id => {
    const projectAssetId = getProjectAssetId(id)
    const root = getRoot(projectAssetId)
    if (!root) {
        throw Error(`Malformed asset ID: ${id}`)
    }
    const match = projectAssetId
        .slice(root.length)
        .match(/^(\/.*)\/.*/)
    const names = match
        ? match[1].split('/').filter(name => name)
        : []
    return names.reduce(
        (acc, name) => acc.length
            ? [...acc, `${acc[acc.length - 1]}/${name}`]
            : [`${root}/${name}`],
        []
    )
}
