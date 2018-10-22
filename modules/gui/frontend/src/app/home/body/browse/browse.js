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

// const files = {
//     'loaded': {
//         '/': {
//             files: [
//                 {name: 'file1', isDirectory: false, size: 100},
//                 {name: 'dir1', isDirectory: true}
//             ]
//         },
//         '/dir1': {
//             files: [
//                 {name: 'file2', isDirectory: false, size: 200},
//                 {name: 'file3', isDirectory: false, size: 300},
//                 {name: 'dir2', isDirectory: true}
//             ]
//         },
//         '/dir1/dir2': {
//             files: [
//                 {name: 'file4', isDirectory: false, size: 400},
//                 {name: 'file5', isDirectory: false, size: 500},
//             ],
//             collapsed: true
//         },
//     },
//     'selected': {
//         'file1': false,
//         'dir1': {
//             'file3': false,
//             'dir2': true
//         }
//     }
// }

const loaded = () =>
    select('files.loaded') || {}

const selected = () =>
    select('files.selected') || {}

const mapStateToProps = () => ({
    loaded: loaded(),
    selected: selected()
})

const loadFiles$ = path => {
    return api.files.loadFiles$(path).pipe(
        catchError(() => {
            Notifications.error('files.loading').dispatch()
            return Observable.of([])
        }),
        map(files => {
            return actionBuilder('LOAD_FILES')
                .set(['files.loaded', dotSafe(path), 'files'], files)
                .build()
        })
    )
}

const removeItem$ = (path, action) => {
    return api.files.removeItem$(path).pipe(
        catchError(() => {
            Notifications.error('files.removing').dispatch()
            return Observable.of([])
        }),
        map(action)
    )
}

const removeFile$ = path => {
    return removeItem$(path, () => {
        const directory = Path.dirname(path)
        const fileName = Path.basename(path)
        return actionBuilder('FILE_REMOVED', {directory, fileName})
            .delValueByTemplate(['files.loaded', dotSafe(directory), 'files'], {name: fileName})
            .build()
    })
}

const removeDirectory$ = path => {
    return removeItem$(path, () => {
        const directory = Path.dirname(path)
        const fileName = Path.basename(path)
        return actionBuilder('DIRECTORY_REMOVED', path)
            .delValueByTemplate(['files.loaded', dotSafe(directory), 'files'], {name: fileName})
            .del(['files.loaded', path])
            .build()
    })
}

class Browse extends React.Component {
    UNSAFE_componentWillMount() {
        this.loadDirectory('/')
    }

    loadDirectory(path) {
        this.props.asyncActionBuilder('LOAD_DIRECTORY', loadFiles$(path))
            .dispatch()
    }

    pathSections(path) {
        return path.substr(1).split('/')
    }

    removeFile(path) {
        this.props.asyncActionBuilder('REMOVE_FILE', removeFile$(path))
            .dispatch()
    }

    removeDirectory(path) {
        this.props.asyncActionBuilder('REMOVE_DIRECTORY', removeDirectory$(path))
            .dispatch()
    }

    removeSelected() {
        const {files, directories} = this.selectedItems()
        files.forEach(file => this.removeFile(file))
        directories.forEach(directory => this.removeDirectory(directory))
        this.clearSelection()
    }

    collapseDirectory(path) {
        actionBuilder('COLLAPSE_DIRECTORY')
            .set(['files.loaded', dotSafe(path), 'collapsed'], true)
            .dispatch()
    }

    expandDirectory(path) {
        actionBuilder('EXPAND_DIRECTORY')
            .del(['files.loaded', dotSafe(path), 'collapsed'])
            .dispatch()
    }

    toggleDirectory(path) {
        const directory = this.props.loaded[path]
        if (directory && !directory.collapsed) {
            this.collapseDirectory(path)
        } else {
            this.expandDirectory(path)
            this.loadDirectory(path)
        }
    }

    selectItem(path, isDirectory) {
        actionBuilder('SELECT_ITEM', {path})
            .set(['files.selected', dotSafe(this.pathSections(path))], isDirectory)
            .dispatch()
    }

    deselectItem(path) {
        actionBuilder('DESELECT_ITEM', {path})
            .del(['files.selected', dotSafe(this.pathSections(path))])
            .dispatch()
    }

    toggleSelection(path, isDirectory) {
        this.isSelected(path, false)
            ? this.deselectItem(path)
            : this.selectItem(path, isDirectory)
    }

    clearSelection() {
        actionBuilder('CLEAR_SELECTED_ITEMS')
            .del('files.selected')
            .dispatch()
    }

    isSelected(path, inherit = true) {
        const isSelected = (pathSections, selected) => {
            if (!selected) {
                return false
            }
            const pathSection = pathSections.splice(0, 1)
            const current = selected[pathSection]
            if (pathSections.length === 0) {
                return _.isBoolean(current)
            }
            if (inherit && current === true) {
                return true
            }
            return isSelected(pathSections, current)
        }
        return isSelected(this.pathSections(path), this.props.selected)
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

    countSelectedItems() {
        const {files, directories} = this.selectedItems()
        return {
            files: files.length,
            directories: directories.length
        }
    }

    downloadSelected() {

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

    renderIcon(path, file) {
        return file.isDirectory
            ? this.renderDirectoryIcon(path)
            : this.renderFileIcon(path)
    }

    renderFileIcon(path) {
        const isImage = path => ['.shp', '.tif', '.tiff', '.vrt'].includes(Path.extname(path))
        return (
            <span className={styles.icon}>
                <Icon name={isImage(path) ? 'file-image' : 'file'}/>
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

    renderDirectoryIcon(path) {
        const directory = this.props.loaded[path]
        const expanded = directory && !directory.collapsed
        const toggleDirectory = e => {
            e.stopPropagation()
            this.toggleDirectory(path)
        }
        return expanded && !directory.files
            ? this.renderSpinner()
            : (
                <span className={[styles.icon, styles.directory].join(' ')} onClick={toggleDirectory}>
                    <Icon name={'chevron-right'} className={expanded ? styles.expanded : styles.collapsed}/>
                </span>
            )
    }

    renderList(path) {
        const directory = this.props.loaded[path]
        return directory && !directory.collapsed ? (
            <ul>
                {this.renderListItems(path, directory.files)}
            </ul>
        ) : null
    }

    renderListItems(path, files) {
        return files ? files.map(file => {
            const fullPath = Path.join(path, file ? file.name : null)
            return (
                <li key={file.name}>
                    <div className={[lookStyles.look, this.isSelected(fullPath) ? lookStyles.highlight: lookStyles.default, styles.item].join(' ')}
                        onClick={() => this.toggleSelection(fullPath, file.isDirectory)}
                        onDoubleClick={() => this.toggleDirectory(fullPath)}>
                        {this.renderIcon(fullPath, file)}
                        <span className={styles.fileName}>{file.name}</span>
                        {this.renderFileInfo(fullPath, file)}
                    </div>
                    {this.renderList(fullPath)}
                </li>
            )
        }) : null
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

    render() {
        return (
            <div className={[styles.browse, flexy.container].join(' ')}>
                {this.renderToolbar()}
                <div className={[styles.fileList, flexy.scrollable].join(' ')}>
                    {this.renderList('/')}
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
