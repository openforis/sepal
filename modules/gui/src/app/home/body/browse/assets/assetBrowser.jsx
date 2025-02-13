import _ from 'lodash'
import moment from 'moment'
import {orderBy} from 'natural-orderby'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import format from '~/format'
import {getLogger} from '~/log'
import lookStyles from '~/style/look.module.css'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {ButtonPopup} from '~/widget/buttonPopup'
import {Icon} from '~/widget/icon'
import {Input} from '~/widget/input'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {RemoveButton} from '~/widget/removeButton'
import {Scrollable} from '~/widget/scrollable'
import {Content, SectionLayout} from '~/widget/sectionLayout'
import {SortButtons} from '~/widget/sortButtons'
import {ToggleButton} from '~/widget/toggleButton'

import {AssetTree} from './assetTree'

const log = getLogger('browse')

import styles from './assetBrowser.module.css'

const ANIMATION_DURATION_MS = 1000

class _AssetBrowser extends React.Component {

    userAssets = api.userAssets.ws()

    state = {
        tree: AssetTree.create(),
        splitDirs: false,
        expandDirs: false,
        sorting: {sortingOrder: 'name', sortingDirection: 1},
        busy: false
    }
    
    constructor() {
        super()
        this.reload = this.reload.bind(this)
        this.removeSelected = this.removeSelected.bind(this)
        this.clearSelection = this.clearSelection.bind(this)
        this.toggleSplitDirs = this.toggleSplitDirs.bind(this)
        this.toggleExpandDirs = this.toggleExpandDirs.bind(this)
        this.setSorting = this.setSorting.bind(this)
        this.renderFolderInput = this.renderFolderInput.bind(this)
    }

    componentDidMount() {
        this.subscribeToUpdates()
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

    reload() {
        this.userAssets.upstream$.next({reload: true})
    }

    create(path) {
        this.userAssets.upstream$.next({createFolder: path})
    }

    remove(paths) {
        this.userAssets.upstream$.next({remove: paths})
    }

    onMessage({_ready, data}) {
        data !== undefined && this.onData(data)
    }

    onData({tree, node, busy}) {
        tree !== undefined && this.onTree(tree)
        node !== undefined && this.onNode(node)
        busy !== undefined && this.onBusy(busy)
    }

    onTree(treeUpdate) {
        const {tree} = this.state
        this.setState({tree: AssetTree.updateTree(tree, treeUpdate)})
    }

    onNode(nodeUpdate) {
        const {tree} = this.state
        this.setState({tree: AssetTree.updateTree(tree, nodeUpdate)})
    }

    onBusy(busy) {
        this.setState({busy})
    }

    getOpenDirectories(path = []) {
        const {tree} = this.state
        return AssetTree.getOpenDirectories(tree, path)
    }

    expandDirectory(node) {
        const {tree} = this.state
        const path = AssetTree.getPath(node)
        this.setState({tree: AssetTree.expandDirectory(tree, path)})
    }

    collapseDirectory(node) {
        const {tree} = this.state
        const path = AssetTree.getPath(node)
        this.setState({tree: AssetTree.collapseDirectory(tree, path)})
    }

    toggleSelected(node) {
        if (!AssetTree.isUnconfirmed(node)) {
            AssetTree.isSelected(node)
                ? this.deselectItem(node)
                : this.selectItem(node)
        }
    }

    selectItem(node) {
        const {tree} = this.state
        const path = AssetTree.getPath(node)
        this.setState({tree: AssetTree.selectItem(tree, path)})
    }

    deselectItem(node) {
        const {tree} = this.state
        const path = AssetTree.getPath(node)
        this.setState({tree: AssetTree.deselectItem(tree, path)})
    }

    clearSelection() {
        const {tree} = this.state
        this.setState({tree: AssetTree.deselectDescendants(tree, [])})
    }

    createFolder(folder) {
        const {tree} = this.state
        const {directories} = AssetTree.getSelectedItems(tree)
        const selectedFolder = directories.length === 1 ? directories[0] : null
        if (selectedFolder) {
            const path = [...selectedFolder, folder]
            if (AssetTree.isExistingPath(tree, path)) {
                Notifications.error({
                    message: msg('browse.createFolder.existing.error'),
                    timeout: 5
                })
            } else {
                this.setState({tree: AssetTree.createFolder(tree, path)})
                this.create(path)
                return true
            }
        }
        return false
    }

    removePaths(paths) {
        const {tree} = this.state
        this.setState({tree: AssetTree.setRemoving(tree, paths)})
        this.remove(paths)
    }

    removeSelected() {
        const {tree} = this.state
        const {files, directories} = AssetTree.getSelectedItems(tree)
        this.removePaths([...directories, ...files])
    }

    countSelectedItems() {
        const {tree} = this.state
        const {files, directories} = AssetTree.getSelectedItems(tree)
        return {
            files: files.length,
            directories: directories.length
        }
    }

    toggleSplitDirs() {
        this.setState(({splitDirs}) => ({splitDirs: !splitDirs}))
    }

    toggleExpandDirs() {
        const {expandDirs} = this.state
        if (expandDirs) {
            this.clearSelection()
            this.setState({expandDirs: false})
        } else {
            this.setState({expandDirs: true})
        }
    }

    removeInfo() {
        const {files, directories} = this.countSelectedItems()
        return msg('browse.removeConfirmation', {files, directories})
    }

    renderOptionsToolbar() {
        const {splitDirs, expandDirs, sorting: {sortingOrder, sortingDirection}} = this.state
        return (
            <ButtonGroup layout='horizontal' spacing='tight'>
                <ToggleButton
                    chromeless
                    shape='pill'
                    label={msg('browse.controls.expandDirs.label')}
                    tooltip={msg(`browse.controls.expandDirs.${expandDirs ? 'hide' : 'show'}.tooltip`)}
                    tooltipPlacement='bottom'
                    selected={expandDirs}
                    onChange={this.toggleExpandDirs}
                />
                <ToggleButton
                    chromeless
                    shape='pill'
                    label={msg('browse.controls.splitDirs.label')}
                    tooltip={msg(`browse.controls.splitDirs.${splitDirs ? 'mix' : 'split'}.tooltip`)}
                    tooltipPlacement='bottom'
                    selected={splitDirs}
                    onChange={this.toggleSplitDirs}
                />
                <SortButtons
                    labels={{
                        name: msg('browse.controls.sorting.name.label'),
                        date: msg('browse.controls.sorting.date.label'),
                    }}
                    sortingOrder={sortingOrder}
                    sortingDirection={sortingDirection}
                    onChange={this.setSorting}
                />
            </ButtonGroup>
        )
    }

    setSorting(sortingOrder, sortingDirection) {
        this.setState({sorting: {sortingOrder, sortingDirection}})
    }

    renderNodeInfo(node) {
        return AssetTree.isDirectory(node)
            ? this.renderDirectoryInfo(node)
            : this.renderFileInfo(node)
    }

    renderFileInfo(node) {
        const updateTime = AssetTree.getUpdateTime(node)
        const info = [
            format.fileSize(node.size, {unit: 'bytes'}),
            moment(updateTime).fromNow()
        ].join(', ')
        return (
            <span className={styles.fileInfo}>
                {info}
            </span>
        )
    }
    
    renderDirectoryInfo(node) {
        const updateTime = AssetTree.getUpdateTime(node)
        return (
            <span className={styles.fileInfo}>
                {moment(updateTime).fromNow()}
            </span>
        )
    }

    renderIcon(node) {
        return AssetTree.isRemoving(node) || AssetTree.isUnconfirmed(node)
            ? this.renderSpinner()
            : AssetTree.isDirectory(node)
                ? this.renderDirectoryIcon(node)
                : this.renderFileIcon(node)
    }

    toggleDirectory(e, node) {
        const {expandDirs} = this.state
        e.stopPropagation()
        if (!expandDirs) {
            if (AssetTree.isOpened(node)) {
                this.collapseDirectory(node)
            } else if (!AssetTree.isUnconfirmed(node)) {
                this.expandDirectory(node)
            }
        }
    }

    renderDirectoryIcon(node) {
        const {expandDirs} = this.state
        const opened = AssetTree.isOpened(node) || expandDirs
        return (
            <span
                className={[styles.icon, styles.directory].join(' ')}
                onClick={e => this.toggleDirectory(e, node)}>
                <Icon
                    name={'chevron-right'}
                    className={opened ? styles.expanded : styles.collapsed}
                />
            </span>
        )
    }

    renderFileIcon(node) {
        const type = AssetTree.getType(node)
        const TYPE = {
            Image: 'image',
            ImageCollection: 'images',
            Table: 'table'
        }
        return (
            <span className={styles.icon}>
                <Icon name={TYPE[type] || 'file'}/>
            </span>
        )
    }

    renderSpinner() {
        return (
            <span className={styles.icon}>
                <Icon name='spinner'/>
            </span>
        )
    }

    renderList(node) {
        const {expandDirs} = this.state
        const items = AssetTree.getChildNodes(node)
        return items && (AssetTree.isOpened(node) || expandDirs) ? (
            <ul>
                {this.renderListItems(items)}
            </ul>
        ) : null
    }

    renderListItems(items) {
        const sorter = this.getSorter()
        return items
            ? _.chain(items)
                .pickBy(file => file)
                .toPairs()
                .thru(sorter)
                .map(([key, node]) => this.renderListItem(key, node))
                .value()
            : null
    }

    renderListItem(key, node) {
        const selected = AssetTree.isSelected(node)
        const adding = AssetTree.isUnconfirmed(node)
        const removing = AssetTree.isRemoving(node)
        const busy = adding || removing
        return (
            <li key={key}>
                <div
                    className={[
                        lookStyles.look,
                        selected ? lookStyles.highlight : lookStyles.transparent,
                        selected ? null : lookStyles.chromeless,
                        adding ? styles.adding : null,
                        removing ? styles.removing : null
                    ].join(' ')}
                    style={{
                        '--depth': AssetTree.getDepth(node),
                        '--animation-duration-ms': ANIMATION_DURATION_MS
                    }}
                    onClick={busy ? null : () => this.toggleSelected(node)}
                >
                    {this.renderIcon(node)}
                    <span className={styles.fileName}>{key}</span>
                    {this.renderNodeInfo(node)}
                </div>
                {this.renderList(node)}
            </li>
        )
    }

    getSorter() {
        const {splitDirs, sorting: {sortingOrder, sortingDirection}} = this.state
        const orderMap = {
            '-1': 'desc',
            '1': 'asc'
        }

        const dirSorter = {
            order: splitDirs ? ([_, node]) => AssetTree.isDirectory(node) : null,
            direction: splitDirs ? 'desc' : null
        }

        const nameSorter = {
            order: ([key]) => key,
            direction: orderMap[sortingDirection]
        }

        const dateSorter = {
            order: ([_, node]) => AssetTree.getUpdateTime(node),
            direction: orderMap[-sortingDirection]
        }

        const naturalSortingDirectoriesFirst = items =>
            orderBy(
                items,
                _.compact([dirSorter.order, nameSorter.order]),
                _.compact([dirSorter.direction, nameSorter.direction])
            )

        const dateSortingDirectoriesFirst = items =>
            orderBy(
                items,
                _.compact([dirSorter.order, dateSorter.order]),
                _.compact([dirSorter.direction, dateSorter.direction])
            )

        const sortingMap = {
            name: naturalSortingDirectoriesFirst,
            date: dateSortingDirectoriesFirst
        }

        return sortingMap[sortingOrder]
    }

    renderActionButtons() {
        const {busy} = this.state
        const {files, directories} = this.countSelectedItems()
        const nothingSelected = files === 0 && directories === 0
        const oneDirectorySelected = files === 0 && directories === 1
        return (
            <ButtonGroup layout='horizontal'>
                <Button
                    chromeless
                    shape='circle'
                    icon='rotate'
                    iconAttributes={{spin: busy}}
                    tooltip={msg('browse.controls.reload.tooltip')}
                    tooltipPlacement='top'
                    disabled={busy}
                    keybinding='Shift+R'
                    onClick={this.reload}
                />
                <ButtonPopup
                    chromeless
                    shape='circle'
                    icon='plus'
                    noChevron
                    tooltip={msg('browse.controls.createFolder.tooltip')}
                    tooltipPlacement='top'
                    vPlacement='below'
                    hPlacement='over-right'
                    disabled={!oneDirectorySelected}
                    keybinding='Shift+A'
                >
                    {this.renderFolderInput}
                </ButtonPopup>
                <RemoveButton
                    chromeless
                    shape='circle'
                    tooltip={msg('browse.controls.remove.tooltip')}
                    tooltipPlacement='top'
                    disabled={nothingSelected}
                    onRemove={this.removeSelected}
                />
                <Button
                    chromeless
                    shape='circle'
                    icon='times'
                    tooltip={msg('browse.controls.clearSelection.tooltip')}
                    tooltipPlacement='top'
                    disabled={nothingSelected}
                    keybinding='Shift+C'
                    onClick={this.clearSelection}
                />
            </ButtonGroup>
        )
    }

    renderFolderInput(close) {
        return (
            <Input
                className={styles.createFolder}
                autoFocus
                placeholder={msg('Enter folder name')}
                onAccept={folder => {
                    if (folder.length && this.createFolder(folder)) {
                        close()
                    }
                }}
                onCancel={close}
            />
        )
    }

    renderActionsToolbar() {
        const {files, directories} = this.countSelectedItems()
        return (
            <Layout type='horizontal'>
                {this.renderActionButtons()}
                <div className={styles.info}>
                    {msg('browse.selected', {files, directories})}
                </div>
            </Layout>
        )
    }

    render() {
        return (
            <SectionLayout>
                <Content className={styles.browse} menuPadding horizontalPadding verticalPadding>
                    {this.renderHeader()}
                    {this.renderTree()}
                </Content>
            </SectionLayout>
        )
    }

    renderHeader() {
        return (
            <Layout type='horizontal' spacing='compact'>
                {this.renderActionsToolbar()}
                {this.renderOptionsToolbar()}
            </Layout>
        )
    }

    renderTree() {
        const {tree} = this.state
        return (
            <Scrollable direction='xy' className={styles.fileList}>
                {this.renderList(tree)}
            </Scrollable>
        )
    }
}

export const AssetBrowser = compose(
    _AssetBrowser,
    withSubscriptions()
)

AssetBrowser.propTypes = {
    id: PropTypes.string
}
