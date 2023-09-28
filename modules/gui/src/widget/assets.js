import {Tree} from 'tree'
import {compose} from 'compose'
import {connect, select} from 'store'
import {map, mergeWith, of, switchMap, tap, throttleTime} from 'rxjs'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

const MAX_RECENT_ASSETS = 20

const assetTree = Tree.createNode()

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

const loadAssets$ = () =>
    loadNode$().pipe(
        tap(({path, nodes}) => Tree.setItems(assetTree, path, nodes)),
        throttleTime(1000, null, {leading: true, trailing: true})
    )

export const loadAssets = () => {
    actionBuilder('LOAD_ASSETS')
        .set('assets.loading', true)
        .dispatch()
    const t0 = Date.now()
    console.log('Loading assets tree')
    loadAssets$().subscribe({
        next: () => {
            const assetList = Tree.flatten(assetTree).map(
                ({path, props}) => ({id: _.last(path), ...props})
            )
            actionBuilder('LOAD_ASSETS')
                .setIfChanged('assets.tree', assetTree)
                .setIfChanged('assets.user', assetList)
                .dispatch()
        },
        error: () => {
            const t1 = Date.now()
            console.log(`Asset tree loading failed after ${t1 - t0} ms`)
            actionBuilder('LOAD_ASSETS')
                .set('assets.error', true)
                .del('assets.loading')
                .dispatch()
        },
        complete: () => {
            const t1 = Date.now()
            console.log(`Asset tree loaded in ${t1 - t0} ms`)
            actionBuilder('LOAD_ASSETS')
                .del('assets.error')
                .del('assets.loading')
                .dispatch()
        }
    })
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
                    reloadAssets: loadAssets
                }
            }))
        )
