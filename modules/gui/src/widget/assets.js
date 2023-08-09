import {EMPTY, concatWith, map, mergeMap, of, switchMap, tap} from 'rxjs'
import {Tree} from 'tree'
import {compose} from 'compose'
import {connect, select} from 'store'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

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

const loadAssetsNode$ = (path = [], node = {}) =>
    api.gee.listAssets$(node).pipe(
        switchMap(items => of(...items)),
        map(node => ({...node, path})),
        mergeMap(node =>
            of(node).pipe(
                concatWith(
                    node.type === 'FOLDER'
                        ? loadAssetsNode$([...path, node.id], node)
                        : EMPTY
                )
            )
        )
    )

export const loadAssets$ = () => {
    const tree = Tree.createNode()
    return loadAssetsNode$().pipe(
        map(({path, id, ...props}) => Tree.setNode(tree, path, id, props)),
        map(assetTree => ({
            assetTree,
            assetList: Tree.flatten(assetTree)
                .map(
                    ({path, props: {name, type} = {}} = {}) => ({id: _.last(path), name, type})
                )
                .filter(
                    ({id, type}) => id && type !== 'FOLDER'
                )
        })),
        tap(({assetTree, assetList}) =>
            actionBuilder('UPDATE_USER_ASSETS')
                .set('assets.tree', assetTree)
                .set('assets.user', assetList)
                .dispatch()
        )
    )
}

export const withAssets = () =>
    WrappedComponent =>
        compose(
            class WithAssetsHOC extends React.Component {
                render() {
                    const {assets} = this.props
                    return React.createElement(WrappedComponent, {...this.props, assets})
                }
            },
            connect(() => ({
                assets: {
                    // tree: select('assets.tree') || {},
                    userAssets: select('assets.user') || [],
                    otherAssets: select('assets.other') || [],
                    addOtherAsset: asset => {
                        const other = select('assets.other') || []
                        actionBuilder('UPDATE_OTHER_ASSETS')
                            .set('assets.other', _.uniq([...other, asset]))
                            .dispatch()
                    }
                }
            }))
        )
