import {Button, ButtonGroup} from 'widget/button'
import {Observable, Subject, forkJoin, timer} from 'rxjs'
import {catchError, delay, exhaustMap, filter, map, takeUntil} from 'rxjs/operators'
import {connect, select} from 'store'
import {msg} from 'translate'
import Icon from 'widget/icon'
import Notifications from 'app/notifications'
import Path from 'path'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder, {dotSafe} from 'action-builder'
import api from 'api'
import flexy from 'flexy.module.css'
import lookStyles from 'style/look.module.css'
import styles from './browse.module.css'

const TREE = 'files.tree'
const REFRESH_INTERVAL_MS = 1000
const ANIMATION_DURATION_MS = 1000

const tree = () =>
    select(TREE) || {}

const mapStateToProps = () => ({
    tree: tree()
})

const pathSections = path =>
    path.split('/').splice(1)

const treePath = (path = '/') =>
    path !== '/'
        ? _.reduce(pathSections(path),
            (treePath, pathElement) => treePath.concat(['files', pathElement]), []
        ) : []

const humanFriendlyFileSize = (size, precisionDigits = 3) => {
    // safe up to yottabytes (10^24)...
    const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const digits = Math.trunc(Math.log10(size))
    const periods = Math.trunc(digits / 3)
    const multiplier = Math.pow(10, 3 * periods)
    const decimals = multiplier > 1
        ? Math.min(precisionDigits - 1, 2) - digits % 3
        : 0
    return size
        ? (size / multiplier).toFixed(decimals) + ' ' + units[periods]
        : msg('browse.info.empty')
}

class Browse extends React.Component {
    disableRefresh$ = new Subject()

    componentDidMount() {
        this.loadPath('/')
        this.props.onEnable(() => this.enableRefresh())
        this.props.onDisable(() => this.disableRefresh())
        this.enableRefresh()
    }

    enableRefresh() {
        this.props.stream('SCHEDULE_REFRESH',
            timer(0, REFRESH_INTERVAL_MS).pipe(
                exhaustMap(() => this.updateTree$()),
                takeUntil(this.disableRefresh$)
            )
        )
    }

    updateTree$() {
        return api.files.updateTree$(this.props.tree).pipe(
            catchError(() => {
                Notifications.error('files.loading').dispatch()
                return Observable.of([])
            }),
            filter(tree => tree),
            map(tree => {
                actionBuilder('UPDATE_TREE')
                    .merge(TREE, tree)
                    .dispatch()
            }),
            delay(ANIMATION_DURATION_MS),
            map(() => this.pruneRemovedNodes(
                actionBuilder('CLEANUP_TREE')).dispatch()
            )
        )
    }

    disableRefresh() {
        this.disableRefresh$.next()
    }

    childPath(path = '/', name = '/') {
        return Path.join(path, name)
    }

    parentPath(path = '/') {
        return Path.dirname(path)
    }

    getNode(path) {
        return _.get(this.props.tree, treePath(path), this.props.tree)
    }

    getFiles(path) {
        return this.getNode(path).files
    }

    loadPath(path) {
        this.props.stream('REQUEST_LOAD_FILES',
            forkJoin(
                api.files.loadPath$(path).pipe(
                    catchError(() => {
                        Notifications.error('files.loading').dispatch()
                        return Observable.of([])
                    })
                ),
                timer(200) // add 200ms comfort delay if response is quicker
            ).pipe(
                map(([tree]) => actionBuilder('LOAD_PATH', {path})
                    .set([TREE, dotSafe(treePath(path))], _.assign(tree, {opened: true}))
                    .dispatch()
                )
            )
        )
    }

    removePaths(paths) {
        actionBuilder('REMOVE_PATH_PENDING', {paths})
            .forEach(paths, (actionBuilder, path) =>
                actionBuilder.set([TREE, dotSafe(treePath(path)), 'removing'], true)
            )
            .dispatch()

        this.props.stream('REQUEST_REMOVE_PATHS',
            api.files.removePaths$(paths).pipe(
                catchError(() => {
                    Notifications.error('files.removing').dispatch()
                    return Observable.of([])
                }),
                map(() => actionBuilder('REMOVE_PATHS', {paths})
                    .forEach(paths, (actionBuilder, path) => {
                        actionBuilder.del([TREE, dotSafe(treePath(path)), 'removing'])
                        actionBuilder.set([TREE, dotSafe(treePath(path)), 'removed'], true)
                    })
                    .dispatch()
                ),
                delay(ANIMATION_DURATION_MS),
                map(() => actionBuilder('REMOVE_PATHS', {paths})
                    .forEach(paths, (actionBuilder, path) =>
                        actionBuilder.del([TREE, dotSafe(treePath(path))])
                    )
                    .dispatch()
                )
            )
        )
    }
    
    pruneRemovedNodes(actionBuilder, path) {
        _.forEach(this.getFiles(path), (file, name) => {
            const childPath = this.childPath(path, name)
            if (file.removed) {
                actionBuilder.del([TREE, dotSafe(treePath(childPath))])
            } else if (this.isDirectory(file)) {
                this.pruneRemovedNodes(actionBuilder, childPath)
            }
        })
        return actionBuilder
    }

    isDirectory(directory) {
        return !!directory.dir
    }

    isDirectoryUnpopulated(directory) {
        return !directory.files
    }

    toggleDirectory(path, directory) {
        if (this.isDirectoryExpanded(path)) {
            this.collapseDirectory(path, directory)
        } else {
            this.expandDirectory(path, directory)
            if (this.isDirectoryUnpopulated(directory)) {
                this.loadPath(path)
            }
        }
    }

    isDirectoryExpanded(path) {
        return !!this.getNode(path).opened
    }

    expandDirectory(path) {
        actionBuilder('EXPAND_DIRECTORY')
            .set([TREE, dotSafe(treePath(path)), 'opened'], true)
            .dispatch()
    }

    removeAddedFlag(actionBuilder, path) {
        _.forEach(this.getFiles(path), (file, name) => {
            const childPath = this.childPath(path, name)
            if (file.added) {
                actionBuilder.del([TREE, dotSafe(treePath(childPath)), 'added'])
            }
            if (this.isDirectory(file)) {
                this.removeAddedFlag(actionBuilder, childPath)
            }
        })
        return actionBuilder
    }

    collapseDirectory(path) {
        this.removeAddedFlag(actionBuilder('COLLAPSE_DIRECTORY'), path)
            .del([TREE, dotSafe(treePath(path)), 'opened'])
            .dispatch()
    }

    toggleSelected(path) {
        this.isSelected(path)
            ? this.deselectItem(path)
            : this.selectItem(path)
    }

    isSelected(path) {
        return this.getNode(path).selected
    }

    isAncestorSelected(path) {
        const parentPath = this.parentPath(path)
        return parentPath !== path
            ? this.isSelected(parentPath) || this.isAncestorSelected(parentPath)
            : false
    }

    deselectAncestors(actionBuilder, path) {
        const parentPath = this.parentPath(path)
        if (parentPath !== path) {
            actionBuilder.del([TREE, dotSafe(treePath(parentPath)), 'selected'])
            this.deselectAncestors(actionBuilder, parentPath)
        }
        return actionBuilder
    }

    deselectDescendants(actionBuilder, path) {
        _.forEach(this.getFiles(path), (file, name) => {
            const childPath = this.childPath(path, name)
            actionBuilder.del([TREE, dotSafe(treePath(childPath)), 'selected'])
            if (this.isDirectory(file)) {
                this.deselectDescendants(actionBuilder, childPath)
            }
        })
        return actionBuilder
    }

    selectItem(path) {
        const deselectHierarchy = (actionBuilder, path) => {
            this.deselectAncestors(actionBuilder, path)
            this.deselectDescendants(actionBuilder, path)
            return actionBuilder
        }
        deselectHierarchy(actionBuilder('SELECT_ITEM', {path}), path)
            .set([TREE, dotSafe(treePath(path)), 'selected'], true)
            .dispatch()
    }

    deselectItem(path) {
        actionBuilder('DESELECT_ITEM', {path})
            .del([TREE, dotSafe(treePath(path)), 'selected'])
            .dispatch()
    }

    clearSelection() {
        this.deselectDescendants(actionBuilder('CLEAR_SELECTION'))
            .dispatch()
    }

    selectedItems(path = '/', selected = {files: [], directories: []}) {
        _.transform(this.getFiles(path), (selected, file, name) => {
            const childPath = this.childPath(path, name)
            if (file.selected) {
                if (this.isDirectory(file)) {
                    selected.directories.push(childPath)
                } else {
                    selected.files.push(childPath)
                }
            } else {
                if (this.isDirectory(file)) {
                    this.selectedItems(childPath, selected)
                }
            }
        }, selected)
        return selected
    }

    removeSelected() {
        const {files, directories} = this.selectedItems()
        this.removePaths(_.concat(directories, files))
        this.clearSelection()
    }

    isRemoved(path) {
        return this.getNode(path).removed
    }

    isAncestorRemoved(path) {
        const parentPath = this.parentPath(path)
        return parentPath !== path
            ? this.isRemoved(parentPath) || this.isAncestorRemoved(parentPath)
            : false
    }

    countSelectedItems() {
        const {files, directories} = this.selectedItems()
        return {
            files: files.length,
            directories: directories.length
        }
    }

    renderToolbar() {
        const selected = this.countSelectedItems()
        const nothingSelected = selected.files === 0 && selected.directories === 0
        const oneFileSelected = selected.files === 1 && selected.directories === 0
        const selectedFiles = this.selectedItems().files
        const selectedFile = selectedFiles.length === 1 && selectedFiles[0]
        const downloadUrl = selectedFile && api.files.downloadUrl(selectedFile)
        const downloadFilename = selectedFiles.length === 1 && Path.basename(selectedFile)
        return (
            <div className={styles.toolbar}>
                <ButtonGroup>
                    <Button
                        tooltip={msg('browse.controls.download.tooltip')}
                        placement='bottom'
                        icon='download'
                        downloadUrl={downloadUrl}
                        downloadFilename={downloadFilename}
                        disabled={!oneFileSelected}
                    />
                    <Button
                        tooltip={msg('browse.controls.remove.tooltip')}
                        placement='bottom'
                        icon='trash-alt'
                        onClickHold={this.removeSelected.bind(this)}
                        disabled={nothingSelected}
                        stopPropagation={true}/>
                    <Button
                        tooltip={msg('browse.controls.clearSelection.tooltip')}
                        placement='bottom'
                        icon='times'
                        onClick={this.clearSelection.bind(this)}
                        disabled={nothingSelected}
                    />
                </ButtonGroup>
                {nothingSelected ? null : (
                    <span className={styles.selected}>
                        {msg('browse.selected', {
                            files: selected.files,
                            directories: selected.directories
                        })}
                    </span>
                )}
            </div>
        )
    }

    renderNodeInfo(file) {
        return this.isDirectory(file)
            ? this.renderDirectoryInfo(file)
            : this.renderFileInfo(file)
    }

    renderFileInfo(file) {
        return (
            <span className={styles.fileInfo}>
                ({humanFriendlyFileSize(file.size)})
            </span>
        )
    }

    renderDirectoryInfo(dir) {
        return (
            <span className={styles.fileInfo}>
                ({msg('browse.info.directory', {itemCount: dir.count})})
            </span>
        )
    }

    renderIcon(path, fileName, file) {
        return this.isDirectory(file)
            ? this.renderDirectoryIcon(path, file)
            : this.renderFileIcon(fileName)
    }

    renderDirectoryIcon(path, directory) {
        const expanded = this.isDirectoryExpanded(path)
        const toggleDirectory = e => {
            e.stopPropagation()
            this.toggleDirectory(path, directory)
        }
        return expanded && !directory.files
            ? this.renderSpinner()
            : (
                <span className={[styles.icon, styles.directory].join(' ')} onClick={toggleDirectory}>
                    <Icon name={'chevron-right'} className={expanded ? styles.expanded : styles.collapsed}/>
                </span>
            )
    }

    renderFileIcon(fileName) {
        const isImage = ['.shp', '.tif', '.tiff', '.vrt'].includes(Path.extname(fileName))
        return (
            <span className={styles.icon}>
                <Icon name={isImage ? 'file-image' : 'file'}/>
            </span>
        )
    }

    renderSpinner() {
        return (
            <span className={styles.icon}>
                <Icon name={'spinner'}/>
            </span>
        )
    }

    renderList(path, tree, depth = 0) {
        const {files} = tree
        return files && this.isDirectoryExpanded(path) ? (
            <ul>
                {this.renderListItems(path, files, depth)}
            </ul>
        ) : null
    }

    renderListItems(path, files, depth) {
        return files ?
            _.chain(files)
                .pickBy(file => file)
                .toPairs()
                .sortBy(0)
                .map(([fileName, file]) => {
                    const fullPath = this.childPath(path, file ? fileName : null)
                    const isSelected = this.isSelected(fullPath) || this.isAncestorSelected(fullPath)
                    const isAdded = file.added
                    const isRemoved = file.removed || this.isRemoved(fullPath) || this.isAncestorRemoved(fullPath)
                    const isRemoving = file.removing && !isRemoved
                    return (
                        <li key={fileName}>
                            <div
                                className={[
                                    lookStyles.look,
                                    isSelected ? lookStyles.highlight : lookStyles.default,
                                    styles.item,
                                    isAdded ? styles.added : null,
                                    isRemoving ? styles.removing : null,
                                    isRemoved ? styles.removed : null
                                ].join(' ')}
                                style={{
                                    '--depth': depth,
                                    '--animation-duration-ms': ANIMATION_DURATION_MS
                                }}
                                onClick={() => this.toggleSelected(fullPath)}
                            >
                                {this.renderIcon(fullPath, fileName, file)}
                                <span className={styles.fileName}>{fileName}</span>
                                {this.renderNodeInfo(file)}
                            </div>
                            {this.renderList(fullPath, file, depth + 1)}
                        </li>
                    )
                }).value()
            : null
    }

    render() {
        return (
            <div className={[styles.browse, flexy.container].join(' ')}>
                {this.renderToolbar()}
                <div className={[styles.fileList, flexy.scrollable].join(' ')}>
                    <div>
                        {this.renderList('/', this.props.tree)}
                    </div>
                </div>
            </div>
        )
    }
}

Browse.propTypes = {
    tree: PropTypes.object
}

export default connect(mapStateToProps)(Browse)
