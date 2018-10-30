import {Button} from 'widget/button'
import {Observable} from 'rxjs'
import {catchError, delay, map} from 'rxjs/operators'
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

const tree = () =>
    select(TREE) || {}

const mapStateToProps = () => ({
    tree: tree()
})

const loadPath$ = path =>
    api.files.loadPath$(path).pipe(
        catchError(() => {
            Notifications.error('files.loading').dispatch()
            return Observable.of([])
        })
    )

const removePaths$ = paths =>
    api.files.removePaths$(paths).pipe(
        catchError(() => {
            Notifications.error('files.removing').dispatch()
            return Observable.of([])
        })
    )

const updateTree$ = current =>
    api.files.updateTree$(current).pipe(
        catchError(() => {
            Notifications.error('files.loading').dispatch()
            return Observable.of([])
        })
    )

const pathSections = path =>
    path.split('/').splice(1)

const treePath = (path = '/') =>
    path !== '/'
        ? _.reduce(pathSections(path),
            (treePath, pathElement) => treePath.concat(['files', pathElement]), []
        ) : []

class Browse extends React.Component {
    UNSAFE_componentWillMount() {
        this.loadPath('/')
        setInterval(() => {
            this.updateTree(this.props.tree)
        }, 2000)
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
            loadPath$(path).pipe(
                map(tree => actionBuilder('LOAD_PATH', {path})
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
            removePaths$(paths).pipe(
                map(() => actionBuilder('REMOVE_PATHS', {paths})
                    .forEach(paths, (actionBuilder, path) => {
                        actionBuilder.del([TREE, dotSafe(treePath(path)), 'removing'])
                        actionBuilder.set([TREE, dotSafe(treePath(path)), 'removed'], true)
                    })
                    .dispatch()
                ),
                delay(1000),
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

    updateTree(current) {
        this.props.stream('REQUEST_UPDATE_TREE',
            updateTree$(current).pipe(
                map(tree => {
                    actionBuilder('UPDATE_TREE')
                        .merge(TREE, tree)
                        .dispatch()
                }),
                delay(1000),
                map(() => this.pruneRemovedNodes(
                    actionBuilder('CLEANUP_TREE')).dispatch()
                )
            )
        )
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
        _.chain(this.getFiles(path))
            .pickBy(file => file.added)
            .forEach((file, name) =>
                actionBuilder.del([TREE, dotSafe(treePath(this.childPath(path, name))), 'added'])
            )
            .value()
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

    downloadSelected() {
        // TODO
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
        return (
            <div className={styles.toolbar}>
                {nothingSelected ? null : (
                    <span>
                        {msg('browse.selected', {
                            files: selected.files,
                            directories: selected.directories
                        })}
                    </span>
                )}
                <Button
                    tooltip={msg('browse.controls.download.tooltip')}
                    placement='bottom'
                    icon='download'
                    onClick={this.downloadSelected.bind(this)}
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
                ({msg('browse.info.file', {size: file.size})})
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
                    const isRemoving = file.removing
                    const isRemoved = file.removed || this.isRemoved(fullPath) || this.isAncestorRemoved(fullPath)
                    return (
                        <li key={fileName}>
                            <div className={[
                                lookStyles.look,
                                isSelected ? lookStyles.highlight : lookStyles.default,
                                styles.item,
                                isAdded ? styles.added : null,
                                isRemoving ? styles.removing : null,
                                isRemoved ? styles.removed : null
                            ].join(' ')}
                            style={{'--depth': depth}}
                            onClick={() => this.toggleSelected(fullPath)}>
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
    loaded: PropTypes.objectOf(
        PropTypes.shape({
            files: PropTypes.arrayOf(PropTypes.object),
            open: PropTypes.bool
        })
    ),
    selected: PropTypes.object
}

export default connect(mapStateToProps)(Browse)
