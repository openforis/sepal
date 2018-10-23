import {Button} from 'widget/button'
import {Observable} from 'rxjs'
import {catchError, map} from 'rxjs/operators'
import {connect, select} from 'store'
import {msg} from 'translate'
import Hammer from 'react-hammerjs'
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

const _tree = {
    open: true,
    files: {
        'file1': {
            size: 1000,
            lastModified: 1234,
            // selected: true
        },
        'file2': {
            size: 100,
            lastModified: 1234
        },
        'dir1': {
            // open: true,
            files: {
                'file3': {
                    size: 400,
                    lastModified: 1234,
                    // selected: true
                },
                'dir2': {
                    // open: true,
                    // selected: true,
                    files: {
                        'file4': {
                            size: 400,
                            lastModified: 1234
                        },
                        'dir3': {
                            files: null
                        },
                        'file5': {
                            size: 683,
                            lastModified: 1234
                        },
                        'a long file name to test hotrizontal scrolling a long file name to test hotrizontal scrolling a long file name to test hotrizontal scrolling ': {
                            size: 4003,
                            lastModified: 1234
                        }
                    }
                }
            }
        }
    }
}

const _selected = {
    'file2': true,
    'dir1': {
        'file3': true,
        'dir3': true
    }
}

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

// const removeItem$ = (path, action) => {
//     return api.files.removeItem$(path).pipe(
//         catchError(() => {
//             Notifications.error('files.removing').dispatch()
//             return Observable.of([])
//         }),
//         map(action)
//     )
// }

// const removeFile$ = path => {
//     return removeItem$(path, () => {
//         const directory = Path.dirname(path)
//         const fileName = Path.basename(path)
//         return actionBuilder('FILE_REMOVED', {directory, fileName})
//             .delValueByTemplate(['files.loaded', dotSafe(directory), 'files'], {name: fileName})
//             .build()
//     })
// }

// const removeDirectory$ = path => {
//     return removeItem$(path, () => {
//         const directory = Path.dirname(path)
//         const fileName = Path.basename(path)
//         return actionBuilder('DIRECTORY_REMOVED', path)
//             .delValueByTemplate(['files.loaded', dotSafe(directory), 'files'], {name: fileName})
//             .del(['files.loaded', path])
//             .build()
//     })
// }

const update$ = current => {
    return api.files.loadFiles$(current).pipe(
        catchError(() => {
            Notifications.error('files.loading').dispatch()
            return Observable.of([])
        }),
        map(tree => {
            // console.log(tree)
            // if (!collapsed) {
            // _.forEach(files, file => {
            //     if (file.isDirectory) {
            //         this.loadDirectory(Path.join(path, file.name), true)
            //     }
            // })
            // }
            return actionBuilder('LOAD_FILES')
                .merge('files.tree', tree)
                .merge('files.opened', {'/': true})
                .dispatch()
        })
    )
}

class Browse extends React.Component {
    UNSAFE_componentWillMount() {
        this.update()
        setTimeout(() => {
            this.update(this.props.tree)
        }, 3000)
    }

    update(current) {
        this.props.stream('UPDATE_DIRECTORY', update$(current))
    }

    treePath(path) {
        return _.reduce(path.split('/').splice(1),
            (treePath, pathElement) => treePath.concat(['files', pathElement]), []
        )
    }

    getNode(path) {
        return _.get(this.props.tree, this.treePath(path))
    }

    // pathSections(path) {
    //     return path.substr(1).split('/')
    // }

    // removeFile(path) {
    //     this.props.asyncActionBuilder('REMOVE_FILE', removeFile$(path))
    //         .dispatch()
    // }

    // removeDirectory(path) {
    //     this.props.asyncActionBuilder('REMOVE_DIRECTORY', removeDirectory$(path))
    //         .dispatch()
    // }

    // removeSelected() {
    //     const {files, directories} = this.selectedItems()
    //     files.forEach(file => this.removeFile(file))
    //     directories.forEach(directory => this.removeDirectory(directory))
    //     this.clearSelection()
    // }

    toggleDirectory(path, directory) {
        if (this.isExpandedDirectory(path)) {
            this.collapseDirectory(path, directory)
        } else {
            this.expandDirectory(path, directory)
            // this.loadDirectory(path)
        }
    }

    isExpandedDirectory(path) {
        return !!this.props.opened[path]
    }

    collapseDirectory(path) {
        actionBuilder('COLLAPSE_DIRECTORY')
            .del(['files.opened', dotSafe(path)])
            .dispatch()
    }

    expandDirectory(path) {
        actionBuilder('EXPAND_DIRECTORY')
            .set(['files.opened', dotSafe(path)], true)
            .dispatch()
    }

    toggleSelected(path) {
        this.isSelected(path)
            ? this.deselectItem(path)
            : this.selectItem(path)
    }

    isSelected(path) {
        return _.get(this.props.selected, path.split('/').splice(1)) === true
    }

    isAncestorSelected(path) {
        const parentPath = Path.dirname(path)
        return parentPath !== path
            ? this.isSelected(parentPath) || this.isAncestorSelected(parentPath)
            : false
    }

    selectItem(path) {
        path && actionBuilder('SELECT_ITEM', {path})
            .set(['files.selected', dotSafe(path.split('/').splice(1))], true)
            .dispatch()
    }

    deselectItem(path) {
        path && actionBuilder('DESELECT_ITEM', {path})
            .del(['files.selected', dotSafe(path.split('/').splice(1))])
            .dispatch()
    }

    clearSelection() {
        actionBuilder('CLEAR_SELECTED_ITEMS')
            .del('files.selected')
            .dispatch()
    }

    // selectedItems() {
    //     const selectedItems = (selected, path) => {
    //         return Object.keys(selected).reduce((acc, key) => {
    //             const value = selected[key]
    //             const fullPath = Path.join(path, key)
    //             if (typeof(value) === 'object') {
    //                 const {files, directories} = selectedItems(value, fullPath)
    //                 return {
    //                     files: acc.files.concat(files),
    //                     directories: acc.directories.concat(directories)
    //                 }
    //             } else {
    //                 value
    //                     ? acc.directories.push(fullPath)
    //                     : acc.files.push(fullPath)
    //                 return acc
    //             }
    //         }, {
    //             files: [],
    //             directories: []
    //         })
    //     }
    //     return selectedItems(this.props.selected, '/')
    // }

    // countSelectedItems() {
    //     const {files, directories} = this.selectedItems()
    //     return {
    //         files: files.length,
    //         directories: directories.length
    //     }
    // }

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
        return file.files
            ? this.renderDirectoryIcon(path, file)
            : this.renderFileIcon(fileName)
    }

    renderDirectoryIcon(path, directory) {
        const expanded = this.isExpandedDirectory(path)
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
        return files && this.isExpandedDirectory(path) ? (
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
                    return (
                        <li key={fileName}>
                            {/* <Hammer
                        onTap={() => this.toggleSelection(fullPath, file.isDirectory)}
                        onDoubleTap={() => this.toggleDirectory(fullPath, file)}> */}
                            <div
                                className={[lookStyles.look, selected ? lookStyles.highlight: lookStyles.default, styles.item].join(' ')}
                                style={{'--depth': depth}}
                                onClick={() => this.toggleSelected(fullPath)}>
                                {this.renderIcon(fullPath, fileName, file)}
                                <span className={styles.fileName}>{fileName}</span>
                                {this.renderFileInfo(fullPath, file)}
                            </div>
                            {/* </Hammer> */}
                            {this.renderList(fullPath, file, depth + 1)}
                        </li>
                    )
                }).value()
            : null
    }

    render() {
        return (
            <div className={[styles.browse, flexy.container].join(' ')}>
                {/* {this.renderToolbar()} */}
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
