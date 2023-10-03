import {EMPTY, Subject, exhaustMap, interval, last, map, merge, mergeWith, of, scan, switchMap, tap, throttleTime} from 'rxjs'
import {Tree} from 'tree'
import {compose} from 'compose'
import {connect, select} from 'store'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

const MAX_RECENT_ASSETS = 20
const REFRESH_INTERVAL_HOURS = 2
const TASK_CHECK_INTERVAL_MINUTES = 5

const assetTree = Tree.createNode()
let previousCompletedTasks = []

const updateAssetRoots$ = () =>
    api.gee.assetRoots$().pipe(
        map(assetRoots =>
            actionBuilder('UPDATE_ASSET_ROOTS')
                .set('gee.assetRoots', assetRoots)
                .dispatch()
        )
    )

export const withAssetRoots = () =>
    WrappedComponent =>
        compose(
            class WithAssetRootsHOC extends React.Component {
                render() {
                    const {assetRoots} = this.props
                    return React.createElement(WrappedComponent, {...this.props, assetRoots})
                }

                componentDidMount() {
                    const {assetRoots, stream} = this.props
                    if (!assetRoots) {
                        stream('UPDATE_ASSET_ROOTS', updateAssetRoots$())
                    }
                }
            },
            connect(() => ({
                assetRoots: select('gee.assetRoots')
            }))
        )

const loadNode$ = (path = [], node = {}) =>
    api.gee.listAssets$(node).pipe(
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

const reloadAssets$ = new Subject()

export const loadAssets$ = () =>
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
        reloadAssets$
    ).pipe(
        exhaustMap(({incremental}) => {
            console.log(`Loading assets tree in ${incremental ? 'incremental' : 'one-shot'} mode`)
            actionBuilder('LOAD_ASSETS')
                .set('assets.loading', incremental)
                .dispatch()
            return loadNode$().pipe(
                scan((assetTree, {path, nodes}) => Tree.setItems(assetTree, path, nodes), assetTree),
                incremental
                    ? throttleTime(1000, null, {leading: true, trailing: true})
                    : last(),
                tap({
                    next: assetTree => {
                        console.log('Updating assets tree')
                        const assetList = Tree.flatten(assetTree).map(
                            ({path, props, depth}) => ({id: _.last(path), ...props, depth})
                        )
                        actionBuilder('LOAD_ASSETS')
                            .setIfChanged('assets.tree', assetTree)
                            .setIfChanged('assets.user', assetList)
                            .dispatch()
                    },
                    error: error => {
                        console.log('Asset tree loading failed', error)
                        actionBuilder('LOAD_ASSETS')
                            .set('assets.error', true)
                            .del('assets.loading')
                            .dispatch()
                    },
                    complete: () => {
                        console.log('Asset tree loaded')
                        actionBuilder('LOAD_ASSETS')
                            .del('assets.error')
                            .del('assets.loading')
                            .dispatch()
                    }
                })
            )
        })
    )

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
                    tree: select('assets.tree') || {},
                    userAssets: select('assets.user') || [],
                    otherAssets: select('assets.other') || [],
                    recentAssets: select('assets.recent') || [],
                    loading: select('assets.loading') || false,
                    updateAsset,
                    removeAsset,
                    reloadAssets: () => reloadAssets$.next({incremental: true})
                }
            }))
        )
