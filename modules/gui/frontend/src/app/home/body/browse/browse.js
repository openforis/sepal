import {Button} from 'widget/button'
import {Observable} from 'rxjs'
import {catchError, map} from 'rxjs/operators'
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

const tree = () =>
    select('files.tree') || {}

const opened = () =>
    select('files.opened') || {}

const selected = () =>
    select('files.selected') || {}

const mapStateToProps = () => ({
    tree: tree(),
    opened: opened(),
    selected: selected()
})

const loadPath$ = path =>
    api.files.loadPath$(path).pipe(
        catchError(() => {
            Notifications.error('files.loading').dispatch()
            return Observable.of([])
        }),
        map(tree => actionBuilder('LOAD_PATH', {path})
            .set(['files.tree', dotSafe(treePath(path))], tree)
            .set(['files.opened', dotSafe(path)], true)
            .dispatch()
        )
    )

const removePath$ = path =>
    api.files.removePath$(path).pipe(
        catchError(() => {
            Notifications.error('files.removing').dispatch()
            return Observable.of([])
        }),
        map(() => actionBuilder('REMOVE_PATH', {path})
            .del(['files.tree', dotSafe(treePath(path))])
            .dispatch()
        )
    )

const updateTree$ = current =>
    api.files.updateTree$(current).pipe(
        catchError(() => {
            Notifications.error('files.loading').dispatch()
            return Observable.of([])
        }),
        map(tree => actionBuilder('UPDATE_TREE')
            .merge('files.tree', tree)
            .dispatch()
        )
    )

const pathSections = path =>
    path.split('/').splice(1)

const treePath = path =>
    path !== '/'
        ? _.reduce(pathSections(path),
            (treePath, pathElement) => treePath.concat(['files', pathElement]), []
        ) : []

class Browse extends React.Component {
    UNSAFE_componentWillMount() {
        this.loadPath('/')
        setTimeout(() => {
            this.updateTree(this.props.tree)
        }, 3000)
    }

    loadPath(path) {
        this.props.stream('REQUEST_LOAD_FILES', loadPath$(path))
    }

    removePath(path) {
        this.props.stream('REQUEST_REMOVE_PATH', removePath$(path))
    }
    
    updateTree(current) {
        this.props.stream('REQUEST_UPDATE_TREE', updateTree$(current))
    }

    isDirectory(directory) {
        return this.isDirectoryPopulated(directory) || this.isDirectoryUnpopulated(directory)
    }

    isDirectoryPopulated(directory) {
        return _.isObject(directory.files)
    }

    isDirectoryUnpopulated(directory) {
        return directory.files === null
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
        return !!this.props.opened[path]
    }

    expandDirectory(path) {
        actionBuilder('EXPAND_DIRECTORY')
            .set(['files.opened', dotSafe(path)], true)
            .dispatch()
    }

    collapseDirectory(path) {
        actionBuilder('COLLAPSE_DIRECTORY')
            .del(['files.opened', dotSafe(path)])
            .dispatch()
    }

    toggleSelected(path, isDirectory) {
        this.isSelected(path)
            ? this.deselectItem(path)
            : this.selectItem(path, isDirectory)
    }

    isSelected(path) {
        return _.isBoolean(_.get(this.props.selected, pathSections(path)))
    }

    isAncestorSelected(path) {
        const parentPath = Path.dirname(path)
        return parentPath !== path
            ? this.isSelected(parentPath) || this.isAncestorSelected(parentPath)
            : false
    }

    selectItem(path, isDirectory) {
        path && actionBuilder('SELECT_ITEM', {path})
            .set(['files.selected', dotSafe(pathSections(path))], isDirectory)
            .dispatch()
    }

    deselectItem(path) {
        path && actionBuilder('DESELECT_ITEM', {path})
            .del(['files.selected', dotSafe(pathSections(path))])
            .dispatch()
    }

    clearSelection() {
        actionBuilder('CLEAR_SELECTED_ITEMS')
            .del('files.selected')
            .dispatch()
    }

    selectedItems() {
        const selectedItems = (selected, path) => {
            return Object.keys(selected).reduce((acc, key) => {
                const value = selected[key]
                const fullPath = Path.join(path, key)
                if (typeof(value) === 'object') {
                    const {files, directories} = selectedItems(value, fullPath)
                    return {
                        files: acc.files.concat(files),
                        directories: acc.directories.concat(directories)
                    }
                } else {
                    value
                        ? acc.directories.push(fullPath)
                        : acc.files.push(fullPath)
                    return acc
                }
            }, {
                files: [],
                directories: []
            })
        }
        return selectedItems(this.props.selected, '/')
    }

    removeSelected() {
        const {files, directories} = this.selectedItems()
        files.forEach(file => this.removePath(file))
        directories.forEach(directory => this.removePath(directory))
        this.clearSelection()
    }

    downloadSelected() {
        // TO BE DONE
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

    renderFileInfo(fullPath, file) {
        if (file.isDirectory) {
            const files = this.props.loaded[fullPath] && this.props.loaded[fullPath].files
            return files
                ? <span className={styles.fileInfo}>({files.length} items)</span>
                : null
        } else {
            return file.size
                ? <span className={styles.fileInfo}>({file.size} bytes)</span>
                : null
        }
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
                .map((file, fileName) => {
                    const fullPath = Path.join(path, file ? fileName : null)
                    const selected = this.isSelected(fullPath) || this.isAncestorSelected(fullPath)
                    const isDirectory = !!file.files
                    return (
                        <li key={fileName}>
                            <div
                                className={[lookStyles.look, selected ? lookStyles.highlight: lookStyles.default, styles.item].join(' ')}
                                style={{'--depth': depth}}
                                onClick={() => this.toggleSelected(fullPath, isDirectory)}>
                                {this.renderIcon(fullPath, fileName, file)}
                                <span className={styles.fileName}>{fileName}</span>
                                {this.renderFileInfo(fullPath, file)}
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
