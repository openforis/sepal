import moment from 'moment'
import {orderBy} from 'natural-orderby'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
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
        sorting: {sortingOrder: 'name', sortingDirection: 1},
        status: {
            busy: false
        }
    }
    
    constructor() {
        super()
        this.reload = this.reload.bind(this)
        this.removeSelected = this.removeSelected.bind(this)
        this.clearSelection = this.clearSelection.bind(this)
        this.toggleSplitDirs = this.toggleSplitDirs.bind(this)
        this.setSorting = this.setSorting.bind(this)
        this.renderFolderInput = this.renderFolderInput.bind(this)
        this.collapseAllDirectories = this.collapseAllDirectories.bind(this)
        this.expandAllDirectories = this.expandAllDirectories.bind(this)
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

    onData({tree, node, status}) {
        tree !== undefined && this.onTree(tree)
        node !== undefined && this.onNode(node)
        status !== undefined && this.onStatus(status)
    }

    onTree(treeUpdate) {
        const {tree} = this.state
        this.setState({tree: AssetTree.updateTree(tree, treeUpdate)})
    }

    onNode(nodeUpdate) {
        const {tree} = this.state
        this.setState({tree: AssetTree.updateTree(tree, nodeUpdate)})
    }

    onStatus(status) {
        this.setState({status})
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

    expandAllDirectories() {
        const {tree} = this.state
        this.setState({tree: AssetTree.expandAllDirectories(tree)})
    }

    collapseDirectory(node) {
        const {tree} = this.state
        const path = AssetTree.getPath(node)
        this.setState({tree: AssetTree.collapseDirectory(tree, path)})
    }

    collapseAllDirectories() {
        const {tree} = this.state
        this.setState({tree: AssetTree.collapseAllDirectories(tree)})
    }

    toggleSelected(node) {
        if (!AssetTree.isAdding(node)) {
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
            const path = [...selectedFolder, ...folder.split('/')]
            if (path.length > 10) {
                Notifications.error({
                    message: msg('browse.createFolder.tooDeep.error'),
                    timeout: 5
                })
            } else if (AssetTree.isExistingPath(tree, path)) {
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

    renderOptionsToolbar() {
        const {splitDirs, sorting: {sortingOrder, sortingDirection}} = this.state
        return (
            <ButtonGroup layout='horizontal' spacing='tight'>
                <Button
                    chromeless
                    shape='pill'
                    label={msg('browse.controls.collapseDirs.label')}
                    labelStyle='smallcaps'
                    tooltip={msg('browse.controls.collapseDirs.tooltip')}
                    tooltipPlacement='bottom'
                    onClick={this.collapseAllDirectories}
                />
                <Button
                    chromeless
                    shape='pill'
                    label={msg('browse.controls.expandDirs.label')}
                    labelStyle='smallcaps'
                    tooltip={msg('browse.controls.expandDirs.tooltip')}
                    tooltipPlacement='bottom'
                    onClick={this.expandAllDirectories}
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
        const info = moment(updateTime).fromNow()
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
        return AssetTree.isAdding(node) || AssetTree.isRemoving(node)
            ? this.renderSpinner()
            : AssetTree.isDirectory(node)
                ? this.renderDirectoryIcon(node)
                : this.renderFileIcon(node)
    }

    toggleDirectory(e, node) {
        e.stopPropagation()
        if (AssetTree.isOpened(node)) {
            this.collapseDirectory(node)
        } else if (!AssetTree.isAdding(node)) {
            this.expandDirectory(node)
        }
    }

    renderDirectoryIcon(node) {
        const opened = AssetTree.isOpened(node)
        return (
            <span
                className={[styles.icon, styles.directory].join(' ')}
                onClick={e => this.toggleDirectory(e, node)}>
                <Icon
                    name={'chevron-right'}
                    className={opened ? styles.expanded : styles.collapsed}
                    dimmed={AssetTree.isLeaf(node)}
                />
            </span>
        )
    }

    renderFileIcon(node) {
        const type = AssetTree.getType(node)
        const TYPE = {
            Image: 'image',
            ImageCollection: 'images',
            Table: 'table',
            Classifier: 'diagram-project',
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
        const items = AssetTree.getChildNodes(node)
        return items && AssetTree.isOpened(node) ? (
            <ul>
                {this.renderListItems(items)}
            </ul>
        ) : null
    }

    renderListItems(items) {
        const sorter = this.getSorter()
        return sorter(Object.entries(items))
            .map(([key, node]) => this.renderListItem(key, node))
    }

    renderListItem(key, node) {
        const selected = AssetTree.isSelected(node)
        const adding = AssetTree.isAdding(node)
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
                    <span className={[
                        styles.fileName,
                        AssetTree.isRoot(node) ? styles.root : null
                    ].join(' ')}>
                        {key}
                    </span>
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
                [dirSorter.order, nameSorter.order].filter(Boolean),
                [dirSorter.direction, nameSorter.direction].filter(Boolean)
            )

        const dateSortingDirectoriesFirst = items =>
            orderBy(
                items,
                [dirSorter.order, dateSorter.order].filter(Boolean),
                [dirSorter.direction, dateSorter.direction].filter(Boolean)
            )

        const sortingMap = {
            name: naturalSortingDirectoriesFirst,
            date: dateSortingDirectoriesFirst
        }

        return sortingMap[sortingOrder]
    }

    renderActionButtons() {
        const {tree, status: {busy, progress}} = this.state
        const {files, directories} = AssetTree.getSelectedItems(tree)
        const nothingSelected = files.length === 0 && directories.length === 0
        const oneDirectorySelected = files.length === 0 && directories.length === 1
        const deletable = files.length > 0 || directories.length > 0 && !directories.find(file => file.length === 1)
        const reloadTooltip = busy
            ? msg('browse.controls.reload.progress', {count: progress})
            : msg('browse.controls.reload.tooltip')

        return (
            <ButtonGroup layout='horizontal'>
                <Button
                    chromeless
                    shape='circle'
                    icon='rotate'
                    iconAttributes={{spin: busy}}
                    tooltip={reloadTooltip}
                    tooltipPlacement='top'
                    tooltipVisible={progress}
                    tooltipAllowedWhenDisabled
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
                    disabled={!deletable}
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
                    {this.renderTooolbar()}
                    {this.renderHeader()}
                    {this.renderTree()}
                </Content>
            </SectionLayout>
        )
    }

    renderTooolbar() {
        return (
            <Layout type='horizontal' spacing='compact'>
                {this.renderActionsToolbar()}
                {this.renderOptionsToolbar()}
            </Layout>
        )
    }

    renderHeader() {
        return (
            <div className={styles.header}>{msg('browse.title.assets')}</div>
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
