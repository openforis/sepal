const _ = require('lodash')
const {formatDistanceStrict} = require('date-fns')

const {userTag, subscriptionTag} = require('./tag')
const {setAssets, getAssets, removeAssets, expireAssets} = require('./assetStore')
const log = require('#sepal/log').getLogger('assetManager')

const {Subject, groupBy, mergeMap, map, tap, defer, repeat, retry, exhaustMap, timer, takeUntil, finalize, filter, switchMap, catchError, from, of, EMPTY, concat, race} = require('rxjs')
const {setUser, getUser, isConnectedWithGoogle, removeUser} = require('./userStore')
const {scanTree$, scanNode$, busy$, isBusy} = require('./assetScanner')
const {pollIntervalMilliseconds} = require('./config')
const {deleteAsset$, createFolder$} = require('./asset')
const {STree} = require('#sepal/tree/sTree')

const MIN_REFRESH_DELAY_MS = 60 * 1000

const createAssetManager = ({out$, stop$}) => {

    const userUp$ = new Subject()
    const userDown$ = new Subject()
    const userUpdate$ = new Subject()
    const subscriptionUp$ = new Subject()
    const subscriptionDown$ = new Subject()
    const update$ = new Subject()
    const remove$ = new Subject()
    const create$ = new Subject()
    const monitor$ = new Subject()
    const unmonitor$ = new Subject()
    const reload$ = new Subject()

    const emptyTree = () =>
        STree.createRoot()

    const setUser$ = user =>
        defer(() => from(setUser(user)).pipe(
            map(() => user)
        ))

    const unmonitorCurrentUser$ = username =>
        unmonitor$.pipe(
            filter(user => user.username === username),
        )

    const currentSubscriptionDown$ = subscriptionId =>
        subscriptionDown$.pipe(
            filter(({subscriptionId: currentSubscriptionId}) => currentSubscriptionId === subscriptionId)
        )

    const scheduledReload$ = username =>
        from(getAssetsReloadDelay(username)).pipe(
            tap(delay => delay && log.debug(`${userTag(username)} next reload in ${formatDistanceStrict(0, delay)}`)),
            switchMap(delay => timer(delay))
        )

    const immediateReload$ = username =>
        reload$.pipe(
            filter(currentUsername => currentUsername === username)
        )
    
    const reloadTrigger$ = username =>
        race(
            scheduledReload$(username),
            immediateReload$(username)
        ).pipe(
            map(() => username)
        )

    const updateTree = async (username, tree) => {
        await saveAssets(username, tree)
        update$.next({username, tree})
    }

    const updateNode = async (username, node) => {
        const {assets} = await getAssets(username)
        if (assets) {
            const updatedAssets = STree.alter(assets, assets => {
                const targetNode = STree.traverse(
                    assets,
                    STree.getPath(node),
                    true,
                    node => STree.updateValue(node,
                        ({adding: _adding, removing: _removing, type = 'Folder', ...prevValue} = {}) => ({type, ...prevValue})
                    )
                )
    
                const updateValue = STree.getValue(node)
                STree.updateValue(
                    targetNode,
                    prevValue => ({...prevValue, ...updateValue})
                )
    
                Object.keys(STree.getChildNodes(node)).forEach(key => {
                    if (!Object.keys(STree.getChildNodes(targetNode)).includes(key)) {
                        STree.addChildNode(targetNode, key, STree.getValue(STree.getChildNode(node, key)))
                    }
                })
    
                Object.keys(STree.getChildNodes(targetNode)).forEach(key => {
                    if (!Object.keys(STree.getChildNodes(node)).includes(key)) {
                        STree.removeChildNode(targetNode, key)
                    }
                })
            })
            
            await saveAssets(username, updatedAssets)
        }
        update$.next({username, node})
    }

    const saveAssets = async (username, assets) => {
        if (!STree.isLeaf(assets)) {
            return await setAssets(username, assets)
        } else {
            log.info(`${userTag(username)} assets not saved (empty)`)
        }
    }

    userUp$.pipe(
        filter(user => isConnectedWithGoogle(user)),
        tap(({username}) => log.debug(`${userTag(username)} up`)),
        takeUntil(stop$)
    ).subscribe({
        next: user => monitor$.next(user),
        error: error => log.error('Unexpected user stream error', error),
        complete: () => log.error('Unexpected user stream complete')
    })

    userUpdate$.pipe(
        filter(user => isConnectedWithGoogle(user)),
        tap(({username}) => log.debug(`${userTag(username)} updated, connected to Google`)),
        takeUntil(stop$)
    ).subscribe({
        next: async user => {
            const prevUser = await getUser(user.username, {allowMissing: true})
            if (prevUser) {
                const accessTokenChanged = prevUser.googleTokens.accessToken !== user.googleTokens.accessToken
                const projectIdChanged = prevUser.googleTokens.projectId !== user.googleTokens.projectId
                if (accessTokenChanged || projectIdChanged) {
                    await expireAssets(user.username)
                    monitor$.next(user)
                }
            } else {
                await expireAssets(user.username)
                monitor$.next(user)
            }
        },
        error: error => log.error('Unexpected user stream error', error),
        complete: () => log.error('Unexpected user stream complete')
    })

    userDown$.pipe(
        tap(({username}) => log.debug(`${userTag(username)} down`)),
        takeUntil(stop$)
    ).subscribe({
        next: async user => {
            unmonitor$.next(user)
            await removeUser(user.username, {allowMissing: true})
        },
        error: error => log.error('Unexpected user stream error', error),
        complete: () => log.error('Unexpected user stream complete')
    })

    userUpdate$.pipe(
        filter(user => !isConnectedWithGoogle(user)),
        tap(({username}) => log.debug(`${userTag(username)} updated, disconnected from Google`)),
        takeUntil(stop$)
    ).subscribe({
        next: async user => {
            unmonitor$.next(user)
            update$.next({username: user.username, tree: emptyTree()})
            await removeUser(user.username, {allowMissing: true})
            await removeAssets(user.username, {allowMissing: true})
        },
        error: error => log.error('Unexpected user stream error', error),
        complete: () => log.error('Unexpected user stream complete')
    })

    monitor$.pipe(
        groupBy(({username}) => username),
        mergeMap(userGroup$ => userGroup$.pipe(
            switchMap(user =>
                setUser$(user).pipe(
                    switchMap(({username}) =>
                        of(username).pipe(
                            tap(() => log.debug(`${userTag(username)} monitoring assets`)),
                            switchMap(() => reloadTrigger$(username).pipe(
                                exhaustMap(() => scanTree$(username).pipe(
                                    map(tree => ({username, tree}))
                                ))
                            )),
                            repeat({delay: 0}),
                            retry({delay: MIN_REFRESH_DELAY_MS}),
                            takeUntil(unmonitorCurrentUser$(username)),
                            finalize(() => log.debug(`${userTag(username)} unmonitoring assets`))
                        )
                    )
                )
            )
        )),
        takeUntil(stop$),
        catchError(error => log.error(error))
    ).subscribe({
        next: async ({username, tree}) => updateTree(username, tree),
        error: error => log.error('Unexpected user stream error', error),
        complete: () => log.error('Unexpected user stream complete')
    })

    const getAssetsReloadDelay = async username => {
        const {timestamp} = await getAssets(username, {allowMissing: true})
        if (timestamp) {
            const age = Date.now() - timestamp
            return Math.max(0, pollIntervalMilliseconds - age)
        } else {
            return 0
        }
    }

    const storedUserAssets$ = username =>
        from(getAssets(username, {allowMissing: true})).pipe(
            tap(({assets}) => {
                if (!assets) reload$.next(username)
            }),
            map(({assets} = {}) => ({tree: assets || emptyTree()}))
        )

    const userAssetsUpdated$ = username =>
        update$.pipe(
            filter(({username: assetsUsername}) => assetsUsername === username)
        )

    subscriptionUp$.pipe(
        tap(({username, clientId, subscriptionId}) => log.debug(`${subscriptionTag({username, clientId, subscriptionId})} up`)),
        groupBy(({subscriptionId}) => subscriptionId),
        mergeMap(subscription$ => subscription$.pipe(
            switchMap(({username, clientId, subscriptionId}) =>
                concat(storedUserAssets$(username), userAssetsUpdated$(username)).pipe(
                    map(({tree, node}) => ({clientId, subscriptionId, data: {tree, node, busy: isBusy(username)}})),
                    takeUntil(currentSubscriptionDown$(subscriptionId)),
                    finalize(() => log.debug(`${subscriptionTag({username, clientId, subscriptionId})} down`))
                )
            )
        ))
    ).subscribe({
        next: ({clientId, subscriptionId, data}) => out$.next({clientId, subscriptionId, data}),
        error: error => log.error('Unexpected subscription stream error', error),
        complete: () => log.error('Unexpected subscription stream complete')
    })

    remove$.pipe(
        mergeMap(({username, path}) =>
            from(getUser(username)).pipe(
                switchMap(user =>
                    deleteAsset$(user, path.join('/')).pipe(
                        tap({
                            complete: () => log.info(`${userTag(username)} removed:`, path.join('/'))
                        }),
                        catchError(error => {
                            log.warn(`${userTag(username)} assets failed`, error)
                            return EMPTY
                        }),
                        switchMap(() => scanNode$(username, path.slice(0, -1)))
                    )
                ),
                map(node => ({username, node}))
            )
        )
    ).subscribe({
        next: async ({username, node}) => await updateNode(username, node),
        error: error => log.error('Unexpected stream error', error),
        complete: () => log.error('Unexpected stream complete')
    })
    
    create$.pipe(
        mergeMap(({username, path}) =>
            from(getUser(username)).pipe(
                switchMap(user =>
                    createFolder$(user, path.join('/')).pipe(
                        tap({
                            complete: () => log.info(`${userTag(username)} created:`, path.join('/'))
                        }),
                        catchError(error => {
                            log.warn(`${userTag(username)} assets failed`, error)
                            return EMPTY
                        }),
                        switchMap(() => scanNode$(username, path.slice(0, -1)))
                    )
                ),
                map(node => ({username, node}))
            )
        )
    ).subscribe({
        next: async ({username, node}) => await updateNode(username, node),
        error: error => log.error('Unexpected stream error', error),
        complete: () => log.error('Unexpected stream complete')
    })

    busy$.pipe(
        map(({username, busy}) => ({username, data: {busy}}))
    ).subscribe({
        next: ({username, data}) => out$.next({username, data}),
        error: error => log.error('Unexpected stream error', error),
        complete: () => log.error('Unexpected stream complete')
    })
    
    const userUp = user =>
        userUp$.next(user)
    
    const userDown = user =>
        userDown$.next(user)
    
    const userUpdate = user =>
        userUpdate$.next(user)

    const subscriptionUp = ({username, clientId, subscriptionId}) =>
        subscriptionUp$.next({username, clientId, subscriptionId})
    
    const subscriptionDown = ({username, clientId, subscriptionId}) =>
        subscriptionDown$.next({username, clientId, subscriptionId})

    const reload = ({username}) =>
        reload$.next(username)
    
    const cancelReload = ({username, clientId, subscriptionId}) =>
        log.debug('implement cancel reload')
    
    const remove = ({username, clientId, subscriptionId, paths}) => {
        paths.forEach(path => {
            log.debug(() => `${subscriptionTag({username, clientId, subscriptionId})} remove path:`, path)
            remove$.next({username, clientId, subscriptionId, path})
        })
    }

    const createFolder = ({username, clientId, subscriptionId, path}) => {
        log.debug(() => `${subscriptionTag({username, clientId, subscriptionId})} create folder path:`, path)
        create$.next({username, clientId, subscriptionId, path})
    }

    return {userUp, userDown, userUpdate, subscriptionUp, subscriptionDown, reload, cancelReload, remove, createFolder}
}

module.exports = {createAssetManager}
