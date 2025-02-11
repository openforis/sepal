import _ from 'lodash'
import React from 'react'
import {Subject} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {AssetTree} from '~/app/home/body/browse/assets/assetTree'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {googleProjectId} from '~/user'

const log = getLogger('assets')

const MAX_RECENT_ASSETS = 20

const command$ = new Subject()

export const withAssets = () =>
    WrappedComponent =>
        compose(
            class WithAssetsHOC extends React.Component {
                render() {
                    return React.createElement(WrappedComponent, {...this.props})
                }
            },
            connect(({assets}) => ({
                assets: {
                    tree: assets?.tree || AssetTree.create(),
                    userAssets: assets?.user || [],
                    otherAssets: assets?.other || [],
                    recentAssets: assets?.recent || [],
                    loading: assets?.loading || false,
                    updating: assets?.updating || false,
                    error: assets?.error || false,
                    // busy: assets?.busy || false,
                    updateAsset: asset => command$.next({updateAsset: {asset}}),
                    removeAsset: id => command$.next({removeAsset: {id}}),
                    reloadAssets: () => command$.next({reload: true}),
                    createFolder: path => command$.next({createFolder: {path}})
                }
            }))
        )

const mapStateToProps = () => ({
    projectId: googleProjectId(),
    tree: select('assets.tree') || AssetTree.create()
})

class _Assets extends React.Component {
    userAssets = api.userAssets.ws()

    render() {
        return null
    }

    componentDidMount() {
        this.subscribeToUpdates()
        this.subscribeToCommands()
    }

    subscribeToUpdates() {
        const {addSubscription} = this.props
        addSubscription(
            this.userAssets.downstream$.subscribe({
                next: msg => this.onMessage(msg),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    subscribeToCommands() {
        const {addSubscription} = this.props
        addSubscription(
            command$.subscribe({
                next: ({reload, cancelReload, removePath, createFolder, updateAsset, removeAsset}) => {
                    if (reload) {
                        this.reload()
                    }
                    if (cancelReload) {
                        this.cancelReload()
                    }
                    if (removePath) {
                        this.removePath(removePath)
                    }
                    if (createFolder) {
                        this.createFolder(createFolder)
                    }
                    if (updateAsset) {
                        this.updateAsset(updateAsset)
                    }
                    if (removeAsset) {
                        this.removeAsset(removeAsset)
                    }
                }
            })
        )
    }

    onMessage({_ready, data}) {
        data !== undefined && this.onData(data)
    }

    onData({tree, node, busy}) {
        tree !== undefined && this.onTree(tree)
        node !== undefined && this.onNode(node)
        // busy !== undefined && this.onBusy(busy)
    }

    onTree(treeUpdate) {
        const {tree} = this.props
        this.setAssetTree(AssetTree.updateTree(tree, treeUpdate))
    }

    onNode(nodeUpdate) {
        const {tree} = this.props
        this.setAssetTree(AssetTree.updateTree(tree, nodeUpdate))
    }

    // onBusy(busy) {
    //     actionBuilder('SET_ASSETS_BUSY_STATE')
    //         .set('assets.busy', busy)
    //         .dispatch()
    // }

    setLoading(loading) {
        actionBuilder('LOADING_ASSETS')
            .set('assets.loading', loading)
            .del('assets.error')
            .dispatch()
    }
        
    setAssetTree(assetTree) {
        log.info('Updating asset tree', assetTree)
        const assetList = AssetTree.toList(assetTree)
        const assetRoots = assetList
            .filter(({depth}) => depth === 1)
            .map(({id}) => id)
        actionBuilder('LOAD_ASSETS')
            // .setIfChanged('assets.roots', assetRoots)
            // .setIfChanged('assets.tree', assetTree)
            // .setIfChanged('assets.user', assetList)
            .set('assets.roots', assetRoots)
            .set('assets.tree', assetTree)
            .set('assets.user', assetList)
            .del('assets.loading')
            .dispatch()
    }

    reload() {
        this.userAssets.upstream$.next({reload: true})
        this.setLoading(true)
    }

    cancelReload() {
        this.userAssets.upstream$.next({cancelReload: true})
        this.setLoading(false)
    }

    removePath(path) {
        this.userAssets.upstream$.next({removePath: path})
    }

    createFolder({path}) {
        const {tree} = this.props
        this.setAssetTree(AssetTree.createFolder(tree, path))
        this.userAssets.upstream$.next({createFolder: path})
    }

    updateAsset({asset}) {
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
    
    removeAsset({id}) {
        actionBuilder('REMOVE_ASSET')
            .del(['assets.recent', {id}])
            .del(['assets.user', {id}])
            .del(['assets.other', {id}])
            .dispatch()
    }
}

export const Assets = compose(
    _Assets,
    connect(mapStateToProps),
    withSubscriptions()
)
