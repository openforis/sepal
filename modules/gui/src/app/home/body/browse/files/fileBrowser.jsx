import moment from 'moment'
import {orderBy} from 'natural-orderby'
import Path from 'path'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {withEnableDetector} from '~/enabled'
import format from '~/format'
import {getLogger} from '~/log'
import lookStyles from '~/style/look.module.css'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {RemoveButton} from '~/widget/removeButton'
import {Scrollable} from '~/widget/scrollable'
import {Content, SectionLayout} from '~/widget/sectionLayout'
import {SortButtons} from '~/widget/sortButtons'
import {ToggleButton} from '~/widget/toggleButton'

import {FileTree} from './fileTree'

const log = getLogger('browse')

import styles from './fileBrowser.module.css'

const ANIMATION_DURATION_MS = 1000

class _FileBrowser extends React.Component {

    userFiles = api.userFiles.ws()

    state = {
        tree: FileTree.create(),
        showDotFiles: false,
        splitDirs: false,
        sorting: {sortingOrder: 'name', sortingDirection: 1}
    }
    
    constructor() {
        super()
        this.onUpdate = this.onUpdate.bind(this)
        this.removeSelected = this.removeSelected.bind(this)
        this.clearSelection = this.clearSelection.bind(this)
        this.toggleDotFiles = this.toggleDotFiles.bind(this)
        this.toggleSplitDirs = this.toggleSplitDirs.bind(this)
        this.setSorting = this.setSorting.bind(this)
        this.collapseAllDirectories = this.collapseAllDirectories.bind(this)
    }

    componentDidMount() {
        const {enableDetector: {onChange}} = this.props
        onChange(enabled => this.enabled(enabled))
        this.subscribeToUpdates()
    }
    
    subscribeToUpdates() {
        const {addSubscription} = this.props
        addSubscription(
            this.userFiles.downstream$.subscribe({
                next: msg => this.onMessage(msg),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    monitor(paths, options = {}) {
        this.userFiles.upstream$.next({
            monitor: paths.map(FileTree.toStringPath),
            ...options
        })
    }

    unmonitor(paths = [[]]) {
        this.userFiles.upstream$.next({
            unmonitor: paths.map(FileTree.toStringPath)
        })
    }

    remove(paths) {
        this.userFiles.upstream$.next({
            remove: paths.map(FileTree.toStringPath)
        })
    }

    reset() {
        this.setState({tree: FileTree.create()})
    }

    onMessage({ready, data}) {
        ready !== undefined && this.onReady(ready)
        data !== undefined && this.onUpdate(data)
    }

    onReady(ready) {
        const {enableDetector: {isEnabled}} = this.props
        if (ready && isEnabled()) {
            this.monitor([[]], {reset: true})
        }
    }

    onUpdate({path, items}) {
        const {tree} = this.state
        this.setState({tree: FileTree.updateItem(tree, FileTree.fromStringPath(path), items)})
    }

    enabled(enabled) {
        if (enabled) {
            this.monitor(this.getOpenDirectories(), {reset: true})
        } else {
            this.unmonitor()
        }
    }

    getOpenDirectories(path = []) {
        const {tree} = this.state
        return FileTree.getOpenDirectories(tree, path)
    }

    expandDirectory(node) {
        const {tree} = this.state
        const path = FileTree.getPath(node)
        this.setState({tree: FileTree.expandDirectory(tree, path)}, () => {
            this.monitor(this.getOpenDirectories(path))
        })
    }

    collapseDirectory(node) {
        const {tree} = this.state
        const path = FileTree.getPath(node)
        this.setState({tree: FileTree.collapseDirectory(tree, path)})
        this.unmonitor([path])
    }

    collapseAllDirectories() {
        const {tree} = this.state
        this.setState({tree: FileTree.collapseAllDirectories(tree)})
    }

    toggleSelected(node) {
        FileTree.isSelected(node)
            ? this.deselectItem(node)
            : this.selectItem(node)
    }

    selectItem(node) {
        const {tree} = this.state
        const path = FileTree.getPath(node)
        this.setState({tree: FileTree.selectItem(tree, path)})
    }

    deselectItem(node) {
        const {tree} = this.state
        const path = FileTree.getPath(node)
        this.setState({tree: FileTree.deselectItem(tree, path)})
    }

    clearSelection() {
        const {tree} = this.state
        this.setState({tree: FileTree.deselectDescendants(tree, [])})
    }

    removePaths(paths) {
        const {tree} = this.state
        this.setState({tree: FileTree.setRemoving(tree, paths)})
        this.remove(paths)
    }

    removeSelected() {
        const {tree} = this.state
        const {files, directories} = FileTree.getSelectedItems(tree)
        this.removePaths([...directories, ...files])
    }

    countSelectedItems() {
        const {tree} = this.state
        const {files, directories} = FileTree.getSelectedItems(tree)
        return {
            files: files.length,
            directories: directories.length
        }
    }

    toggleDotFiles() {
        this.setState(({showDotFiles}) => ({showDotFiles: !showDotFiles}))
    }

    toggleSplitDirs() {
        this.setState(({splitDirs}) => ({splitDirs: !splitDirs}))
    }

    removeInfo() {
        const {files, directories} = this.countSelectedItems()
        return msg('browse.removeConfirmation', {files, directories})
    }

    renderOptionsToolbar() {
        const {showDotFiles, splitDirs, sorting: {sortingOrder, sortingDirection}} = this.state
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
                <ToggleButton
                    chromeless
                    shape='pill'
                    label={msg('browse.controls.dotFiles.label')}
                    tooltip={msg(`browse.controls.dotFiles.${showDotFiles ? 'hide' : 'show'}.tooltip`)}
                    tooltipPlacement='bottom'
                    selected={showDotFiles}
                    onChange={this.toggleDotFiles}
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
        return FileTree.isDirectory(node)
            ? this.renderDirectoryInfo(node)
            : this.renderFileInfo(node)
    }

    renderFileInfo(node) {
        const mtime = FileTree.getMTime(node)
        const info = [
            format.fileSize(node.size, {unit: 'bytes'}),
            moment(mtime).fromNow()
        ].join(', ')
        return (
            <span className={styles.fileInfo}>
                {info}
            </span>
        )
    }
    
    renderDirectoryInfo(node) {
        const mtime = FileTree.getMTime(node)
        return (
            <span className={styles.fileInfo}>
                {moment(mtime).fromNow()}
            </span>
        )
    }

    renderIcon(key, node) {
        return FileTree.isDirectory(node)
            ? this.renderDirectoryIcon(node)
            : this.renderFileIcon(key)
    }

    toggleDirectory(e, node) {
        e.stopPropagation()
        if (FileTree.isOpened(node)) {
            this.collapseDirectory(node)
        } else {
            this.expandDirectory(node)
        }
    }

    renderDirectoryIcon(node) {
        const opened = FileTree.isOpened(node)
        const busy = FileTree.isLoading(node)
        return (
            <span
                className={[styles.icon, styles.directory].join(' ')}
                onClick={e => this.toggleDirectory(e, node)}>
                <Icon
                    name={'chevron-right'}
                    className={opened ? styles.expanded : styles.collapsed}
                    attributes={{
                        fade: busy
                    }}
                />
            </span>
        )
    }

    renderFileIcon(key) {
        const isImage = ['.shp', '.tif', '.tiff', '.vrt'].includes(Path.extname(key))
        return (
            <span className={styles.icon}>
                <Icon name={isImage ? 'file-image' : 'file'}/>
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
        const items = FileTree.getChildNodes(node)
        return items && FileTree.isOpened(node) ? (
            <ul>
                {this.renderListItems(items)}
            </ul>
        ) : null
    }

    renderListItems(items) {
        const {showDotFiles} = this.state
        const sorter = this.getSorter()
        return sorter(Object.entries(items))
            .filter(([fileName]) => showDotFiles || !fileName.startsWith('.'))
            .map(([key, node]) => this.renderListItem(key, node))
    }

    renderListItem(key, node) {
        const selected = FileTree.isSelected(node)
        const adding = FileTree.isAdding(node)
        const removing = FileTree.isRemoving(node)
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
                        '--depth': FileTree.getDepth(node),
                        '--animation-duration-ms': ANIMATION_DURATION_MS
                    }}
                    onClick={() => this.toggleSelected(node)}
                >
                    {this.renderIcon(key, node)}
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
            order: splitDirs ? ([_, node]) => FileTree.isDirectory(node) : null,
            direction: splitDirs ? 'desc' : null
        }

        const nameSorter = {
            order: ([key]) => key,
            direction: orderMap[sortingDirection]
        }

        const dateSorter = {
            order: ([_, node]) => FileTree.getMTime(node),
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
        const {tree} = this.state
        const {files, directories} = this.countSelectedItems()
        const nothingSelected = files === 0 && directories === 0
        const oneFileSelected = files === 1 && directories === 0
        const {files: selectedFiles} = FileTree.getSelectedItems(tree)
        const selectedFile = selectedFiles.length === 1 && selectedFiles[0]
        const downloadUrl = selectedFile && api.userFiles.downloadUrl(selectedFile)
        const downloadFilename = selectedFiles.length === 1 && Path.basename(selectedFile)
        return (
            <ButtonGroup layout='horizontal'>
                <Button
                    chromeless
                    shape='circle'
                    icon='download'
                    tooltip={msg('browse.controls.download.tooltip')}
                    tooltipPlacement='bottom'
                    disabled={!oneFileSelected}
                    downloadUrl={downloadUrl}
                    downloadFilename={downloadFilename}
                />
                <RemoveButton
                    chromeless
                    shape='circle'
                    tooltip={msg('browse.controls.remove.tooltip')}
                    tooltipPlacement='bottom'
                    disabled={nothingSelected}
                    onRemove={this.removeSelected}
                />
                <Button
                    chromeless
                    shape='circle'
                    icon='rotate-left'
                    tooltip={msg('browse.controls.clearSelection.tooltip')}
                    tooltipPlacement='bottom'
                    disabled={nothingSelected}
                    onClick={this.clearSelection}
                />
            </ButtonGroup>
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
                    {this.renderToolbar()}
                    {this.renderHeader()}
                    {this.renderTree()}
                </Content>
            </SectionLayout>
        )
    }

    renderToolbar() {
        return (
            <Layout type='horizontal' spacing='compact'>
                {this.renderActionsToolbar()}
                {this.renderOptionsToolbar()}
            </Layout>
        )
    }

    renderHeader() {
        return (
            <div className={styles.header}>{msg('browse.title.files')}</div>
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

export const FileBrowser = compose(
    _FileBrowser,
    withEnableDetector(),
    withSubscriptions()
)

FileBrowser.propTypes = {
    id: PropTypes.string
}
