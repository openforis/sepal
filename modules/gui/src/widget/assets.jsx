import _ from 'lodash'
import React from 'react'
import {catchError, EMPTY, exhaustMap, finalize, interval, map, merge, mergeWith, of, scan, Subject, switchMap, takeLast, takeUntil, tap, throttleTime} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {Tree} from '~/tree'
import {googleProjectId} from '~/user'

const log = getLogger('assets')

const MAX_RECENT_ASSETS = 20
const REFRESH_INTERVAL_HOURS = 2
const TASK_CHECK_INTERVAL_MINUTES = 5

const assetTree = Tree.createNode()
let previousCompletedTasks = []

const loadNode$ = (path = [], node = {}) => {
    return api.gee.listAssets$(node).pipe(
        catchError(error => {
            if (path.length < 2) {
                log.debug('Failed to retrieve some asset roots', error)
            } else {
                log.debug('Failed to retrieve some assets', error)
                actionBuilder('LOAD_ASSETS')
                    .set('assets.error', true)
                    .dispatch()
            }
            return of([])
        }),
        switchMap(nodes =>
            of({path, nodes}).pipe(
                mergeWith(...loadNodes$(path, nodes))
            )
        )
    )
}

const loadNodes$ = (path, nodes) =>
    nodes
        .filter(({type}) => type === 'Folder')
        .map(node => loadNode$([...path, node.id], node))

const listCompletedTasks$ = () =>
    api.gee.listCompletedTasks$().pipe(
        catchError(error => {
            log.debug('Failed to retrieve the list of completed task', error)
            return EMPTY
        })
    )

const startReloadAssets$ = new Subject()
const cancelReloadAssets$ = new Subject()

const initialLoad$ = () =>
    of({incremental: true})

const scheduledReload$ = () =>
    interval(REFRESH_INTERVAL_HOURS * 3600 * 1000).pipe(
        map(() => ({incremental: false}))
    )

const taskCompletedReload$ = () =>
    interval(TASK_CHECK_INTERVAL_MINUTES * 60 * 1000).pipe(
        switchMap(() => listCompletedTasks$()),
        switchMap(completedTasks => {
            if (_.isEqual(completedTasks, previousCompletedTasks)) {
                return EMPTY
            }
            previousCompletedTasks = completedTasks
            return of({incremental: false})
        })
    )

const userReload$ = () =>
    startReloadAssets$.pipe(
        map(() => ({incremental: true}))
    )

const loadAssets$ = () =>
    merge(
        initialLoad$(),
        scheduledReload$(),
        taskCompletedReload$(),
        userReload$()
    ).pipe(
        exhaustMap(({incremental}) => {
            log.debug(`Loading assets tree in ${incremental ? 'incremental' : 'one-shot'} mode`)
            actionBuilder('LOAD_ASSETS')
                .set('assets.loading', incremental)
                .del('assets.error')
                .dispatch()
            return loadNode$().pipe(
                scan(
                    (assetTree, {path, nodes}) =>
                        nodes.reduce(
                            (assetTree, node) => Tree.setValue(assetTree, [...path, node.id], {type: node.type, quota: node.quota}),
                            assetTree
                        ),
                    assetTree
                ),
                incremental
                    ? throttleTime(1000, null, {leading: true, trailing: true})
                    : takeLast(1),
                takeUntil(cancelReloadAssets$),
                tap({
                    next: assetTree => updateAssetTree(assetTree),
                    complete: () => {
                        log.debug('Asset tree loaded')
                        actionBuilder('LOAD_ASSETS')
                            .del('assets.loading')
                            .dispatch()
                    }
                }),
                catchError(error => {
                    log.debug('Asset tree loading failed', error)
                    return EMPTY
                })
            )
        }),
        finalize(() => {
            log.debug('Remove assets')
            actionBuilder('REMOVE_ASSETS')
                .del('assets')
                .dispatch()
        })
    )

const updateAssetTree = assetTree => {
    const assetList = Tree.flatten(assetTree, ({path, value, depth}) => ({id: _.last(path), ...value, depth}))
        .filter(({depth}) => depth > 0)
    const assetRoots = assetList
        .filter(({depth}) => depth === 1)
        .map(({id}) => id)
    log.debug('Updating asset tree')
    actionBuilder('LOAD_ASSETS')
        .setIfChanged('assets.roots', assetRoots)
        .setIfChanged('assets.tree', assetTree)
        .setIfChanged('assets.user', assetList)
        .dispatch()
}

const updateAsset = asset => {
    const roots = select('assets.roots') || []
    const recentAssets = select('assets.recent') || []
    const otherAssets = select('assets.other') || []
    const isUserAsset = _.find(roots, root => asset.id.startsWith(root))
    actionBuilder('UPDATE_ASSET')
        .set('assets.recent', _.uniqBy([asset, ...recentAssets], 'id').slice(0, MAX_RECENT_ASSETS))
        .dispatch()

    api.gee.datasets$(asset.id).subscribe(
        ({matchingResults}) => {
            if (matchingResults === 0 && !isUserAsset) {
                actionBuilder('UPDATE_ASSET')
                    .set('assets.other', _.uniqBy([...otherAssets, asset], 'id'))
                    .dispatch()
            }
        }
    )
}

const removeAsset = id => {
    actionBuilder('REMOVE_ASSET')
        .del(['assets.recent', {id}])
        .del(['assets.user', {id}])
        .del(['assets.other', {id}])
        .dispatch()
}

const reloadAssets = () =>
    startReloadAssets$.next()

const cancelReload = () =>
    cancelReloadAssets$.next()

const createFolder = (parentPath, folder) => {
    cancelReload()

    actionBuilder('CREATE_FOLDER')
        .set('assets.updating', true)
        .dispatch()

    const path = folder
        .split('/')
        .reduce(
            (parentPath, pathSection) => {
                const newPath = [
                    ...parentPath,
                    `${_.last(parentPath)}/${pathSection}`
                ]
                Tree.setValue(assetTree, newPath, {type: 'NewFolder'})
                return newPath
            },
            parentPath
        )

    const id = _.last(path)

    updateAssetTree(assetTree)

    api.gee.createFolder$({id}).pipe(
        tap({
            complete: () => {
                actionBuilder('CREATE_FOLDER')
                    .del('assets.updating')
                    .dispatch()
                reloadAssets()
            },
            error: () => {
                actionBuilder('CREATE_FOLDER')
                    .del('assets.updating')
                    .dispatch()
            }
        })
    ).subscribe()
}

export const withAssets = () =>
    WrappedComponent =>
        compose(
            class WithAssetsHOC extends React.Component {
                render() {
                    const {assets} = this.props
                    return React.createElement(WrappedComponent, {
                        ...this.props,
                        assets
                    })
                }
            },
            connect(() => ({
                assets: {
                    tree: select('assets.tree') || Tree.createNode(),
                    userAssets: select('assets.user') || [],
                    otherAssets: select('assets.other') || [],
                    recentAssets: select('assets.recent') || [],
                    loading: select('assets.loading') || false,
                    updating: select('assets.updating') || false,
                    error: select('assets.error') || false,
                    updateAsset,
                    removeAsset,
                    reloadAssets,
                    createFolder
                }
            }))
        )

class _Assets extends React.Component {
    cancel$ = new Subject()

    render() {
        return null
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {projectId, addSubscription} = this.props
        this.cancel$.next()
        if (projectId) {
            addSubscription(
                loadAssets$().pipe(
                    takeUntil(this.cancel$)
                ).subscribe({
                    error: error => log.error('Unexpected stream error', error)
                })
            )
        }
    }
}

export const Assets = compose(
    _Assets,
    connect(() => ({projectId: googleProjectId()})),
    withSubscriptions()
)
