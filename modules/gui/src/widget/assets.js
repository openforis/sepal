import {EMPTY, Subject, catchError, exhaustMap, finalize, interval, last, map, merge, mergeWith, of, scan, switchMap, takeUntil, tap, throttleTime} from 'rxjs'
import {Tree} from 'tree'
import {actionBuilder} from 'action-builder'
import {compose} from 'compose'
import {connect} from 'connect'
import {getLogger} from 'log'
import {googleProjectId} from 'user'
import {select} from 'store'
import {withSubscriptions} from 'subscription'
import React from 'react'
import _ from 'lodash'
import api from 'apiRegistry'

const log = getLogger('assets')

const MAX_RECENT_ASSETS = 20
const REFRESH_INTERVAL_HOURS = 2
const TASK_CHECK_INTERVAL_MINUTES = 5

const assetTree = Tree.createNode()
let previousCompletedTasks = []

const loadNode$ = (path = [], node = {}) =>
    api.gee.listAssets$(node).pipe(
        catchError(() => {
            log.debug('Cannot retrieve user assets')
            return []
        }),
        switchMap(nodes =>
            of({path, nodes}).pipe(
                mergeWith(...loadNodes$(path, nodes))
            )
        )
    )

const loadNodes$ = (path, nodes) =>
    nodes
        .filter(({type}) => type === 'Folder')
        .map(node => loadNode$([...path, node.id], node))

const startReloadAssets$ = new Subject()
const cancelReloadAssets$ = new Subject()

const loadAssets$ = () =>
    merge(
        of({incremental: true}),
        interval(REFRESH_INTERVAL_HOURS * 3600 * 1000).pipe(
            map(() => ({incremental: false}))
        ),
        interval(TASK_CHECK_INTERVAL_MINUTES * 60 * 1000).pipe(
            switchMap(() => api.gee.listCompletedTasks$()),
            switchMap(completedTasks => {
                if (_.isEqual(completedTasks, previousCompletedTasks)) {
                    return EMPTY
                }
                previousCompletedTasks = completedTasks
                return of({incremental: false})
            })
        ),
        startReloadAssets$.pipe(
            map(() => ({incremental: true}))
        )
    ).pipe(
        exhaustMap(({incremental}) => {
            log.debug(`Loading assets tree in ${incremental ? 'incremental' : 'one-shot'} mode`)
            actionBuilder('LOAD_ASSETS')
                .set('assets.loading', incremental)
                .dispatch()
            return loadNode$().pipe(
                // scan((assetTree, {path, nodes}) => Tree.setItems(assetTree, path, nodes), assetTree),
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
                    : last(),
                takeUntil(cancelReloadAssets$),
                tap({
                    next: assetTree => updateAssetTree(assetTree),
                    error: error => {
                        log.debug('Asset tree loading failed', error)
                        actionBuilder('LOAD_ASSETS')
                            .set('assets.error', true)
                            .del('assets.loading')
                            .dispatch()
                    },
                    complete: () => {
                        log.debug('Asset tree loaded')
                        actionBuilder('LOAD_ASSETS')
                            .del('assets.error')
                            .del('assets.loading')
                            .dispatch()
                    }
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
    actionBuilder('LOAD_ASSETS')
        .setIfChanged('assets.roots', assetRoots)
        .setIfChanged('assets.tree', assetTree)
        .setIfChanged('assets.user', assetList)
        .dispatch()
}

const updateAsset = asset => {
    const roots = Object.keys(select('assets.tree.items') || {})
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
        const {projectId} = this.props
        this.cancel$.next()
        if (projectId) {
            const {addSubscription} = this.props
            addSubscription(
                loadAssets$().pipe(
                    takeUntil(this.cancel$)
                ).subscribe()
            )
        }
    }
}

export const Assets = compose(
    _Assets,
    connect(() => ({projectId: googleProjectId()})),
    withSubscriptions()
)
