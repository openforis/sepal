import React from 'react'
import {connect, select} from 'store'
import Http from 'http-client'
import Rx from 'rxjs'
import Notifications from 'app/notifications'
import actionBuilder from 'action-builder'
import PropTypes from 'prop-types'
import styles from './browse.module.css'
import Icon from 'widget/icon'
import Path from 'path'
import {IconButton} from 'widget/button'
import Tooltip from 'widget/tooltip'

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
//         'file1': true,
//         'dir1': {
//             'file3': true,
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

const loadFiles$ = (path) => {
    return Http.get$('/api/user/files?path=' + encodeURIComponent(path))
        .map((e) => e.response)
        .catch(() => {
            Notifications.error('files.loading').dispatch()
            return Rx.Observable.of([])
        })
        .map((files) => {
            return actionBuilder('LOAD_FILES')
                .set(['files', 'loaded', path, 'files'], files)
                .build()
        })
}

const removeItem$ = (path, action) => {
    return Http.delete$('/api/user/files/' + encodeURIComponent(path))
        .map((e) => e.response)
        .catch(() => {
            Notifications.error('files.removing').dispatch()
            return Rx.Observable.of([])
        })
        .map(action)
}

const removeFile$ = (path) => {
    return removeItem$(path, () => {
        const directory = Path.dirname(path)
        const fileName = Path.basename(path)
        return actionBuilder('FILE_REMOVED', {directory, fileName})
            .delValueByKey(['files', 'loaded', directory, 'files'], 'name', fileName)
            .build()
    })
}

const removeDirectory$ = (path) => {
    return removeItem$(path, () => {
        const directory = Path.dirname(path)
        const fileName = Path.basename(path)
        return actionBuilder('DIRECTORY_REMOVED', path)
            .delValueByKey(['files', 'loaded', directory, 'files'], 'name', fileName)
            .del(['files', 'loaded', path])
            .build()
    })
}

class Browse extends React.Component {
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
        files.forEach((file) => this.removeFile(file))
        directories.forEach((directory) => this.removeDirectory(directory))
        this.clearSelection()
    }
    componentWillMount() {
        this.loadDirectory('/')
    }
    loadDirectory(path) {
        this.props.asyncActionBuilder('LOAD_DIRECTORY', loadFiles$(path))
            .dispatch()
    }
    collapseDirectory(path) {
        actionBuilder('COLLAPSE_DIRECTORY')
            .set(['files', 'loaded', path, 'collapsed'], true)
            .dispatch()
    }
    expandDirectory(path) {
        actionBuilder('EXPAND_DIRECTORY')
            .del(['files', 'loaded', path, 'collapsed'])
            .dispatch()
    }
    toggleSelection(path, isDirectory) {
        const pathSections = this.pathSections(path)
        if (this.isSelected(path)) {
            actionBuilder('DESELECT_ITEM', {path})
                .del(['files', 'selected', ...pathSections])
                .dispatch()
        } else {
            actionBuilder('SELECT_ITEM', {path})
                .set(['files', 'selected', ...pathSections], isDirectory)
                .dispatch()
        }
    }
    clearSelection() {
        actionBuilder('CLEAR_SELECTED_ITEMS')
            .del(['files', 'selected'])
            .dispatch()
    }
    isSelected(path) {
        const isSelected = (pathSections, selected) => {
            if (!selected) {
                return false
            }
            if (pathSections.length === 1) {
                return selected[pathSections[0]] === true || selected[pathSections[0]] === false
            }
            const pathSection = pathSections.splice(0, 1)
            return isSelected(pathSections, selected[pathSection])
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
                    if (value) {
                        acc.directories.push(fullPath)
                    } else {
                        acc.files.push(fullPath)
                    }
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
    toggleDirectory(path) {
        const directory = this.props.loaded[path]
        if (directory && !directory.collapsed) {
            this.collapseDirectory(path)
        } else {
            this.expandDirectory(path)
            this.loadDirectory(path)
        }
    }
    downloadSelected() {

    }
    pathSections(path) {
        return path.substr(1).split('/')
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
        const isImage = (path) => {
            return ['.shp', '.tif', '.tiff', '.vrt'].includes(Path.extname(path))
        }
        return file.isDirectory 
            ? this.renderDirectoryIcon(path) 
            : (
                <span className={styles.icon}>
                    <Icon name={isImage(path) ? 'file-image-o' : 'file'}/>
                </span>
            )
    }
    renderDirectoryIcon(path) {
        const directory = this.props.loaded[path]
        const expanded = directory && !directory.collapsed
        if (expanded && !directory.files) {
            return (
                <span className={styles.icon}>
                    <Icon name={'spinner'}/>
                </span>
            )
        } else {
            const toggleDirectory = (e) => {
                e.stopPropagation()
                this.toggleDirectory(path)
            } 
            return (
                <span className={[styles.icon, styles.directory].join(' ')} onClick={toggleDirectory}> 
                    <Icon name={'chevron-right'} className={expanded ? styles.expanded : styles.collapsed}/>
                </span>
            )
        }
    }
    renderList(path) {
        const directory = this.props.loaded[path]
        return directory && !directory.collapsed ? (
            <ul className={styles.fileList}>
                {this.renderListItems(path, directory.files)}
            </ul>
        ) : null
    }
    renderListItems(path, files) {
        return files ? files.map((file) => {
            const fullPath = Path.join(path, file ? file.name : null)
            return (
                <li key={file.name}>
                    <div className={this.isSelected(fullPath) ? styles.selected : null}
                        onClick={() => this.toggleSelection(fullPath, file.isDirectory)}>
                        {this.renderIcon(fullPath, file)}
                        <span className={styles.fileName}>{file.name}</span>
                        {this.renderFileInfo(fullPath, file)}
                    </div>
                    {this.renderList(fullPath)}
                </li>
            )
        }) : null
    }
    renderSelected() {
        const {files, directories} = this.countSelectedItems()
        return files || directories ? (
            <div>
                {files} files and {directories} directories selected
            </div>
        ) : null
    }
    renderEditControls() {
        return (
            <div>
                <Tooltip msg='browse.controls.remove' top>
                    <IconButton icon='trash-o' onClick={this.removeSelected.bind(this)} disabled={false} />
                </Tooltip>
                <Tooltip msg='browse.controls.download' top>
                    <IconButton icon='download' onClick={this.downloadSelected.bind(this)} disabled={false}/>
                </Tooltip>
                <Tooltip msg='browse.controls.clearSelection' top>
                    <IconButton icon='times' onClick={this.clearSelection.bind(this)}/>
                </Tooltip>
            </div>
        )
    }
    render() {
        return (
            <div className={styles.browse}>
                <div className={styles.controls}>
                    {this.renderSelected()}
                    {this.renderEditControls()}
                </div>
                {this.renderList('/')}
            </div>
        )
    }
}

Browse.propTypes = {
    loaded: PropTypes.objectOf(
        PropTypes.shape({
            open: PropTypes.bool,
            files: PropTypes.arrayOf(PropTypes.object)
        })
    ),
    selected: PropTypes.object,
    action: PropTypes.func,
    asyncActionBuilder: PropTypes.func
}

export default connect(mapStateToProps)(Browse)