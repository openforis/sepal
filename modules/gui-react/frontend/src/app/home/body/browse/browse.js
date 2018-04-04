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
import {msg} from 'translate'
import {IconButton} from 'widget/button'
import Tooltip from 'widget/tooltip'
import { isAppPath } from 'route'

const files = () =>
    select('files') || {}

const mapStateToProps = () => ({
    files: files(),
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
                .set(['files', path, 'files'], files)
                .build()
        })
}

class Browse extends React.Component {
    componentWillMount() {
        this.loadDirectory('/')
    }
    loadDirectory(path) {
        this.props.asyncActionBuilder('LOAD_DIRECTORY', loadFiles$(path))
            .dispatch()
    }
    collapseDirectory(path) {
        actionBuilder('COLLAPSE_DIRECTORY')
            .set(['files', path, 'collapsed'], true)
            .dispatch()
    }
    expandDirectory(path) {
        actionBuilder('EXPAND_DIRECTORY')
            .del(['files', path, 'collapsed'])
            .dispatch()
    }
    toggleSelection(path) {
        const pathSections = this.pathSections(path)
        if (this.isSelected(path)) {
            actionBuilder('DESELECT_ITEM', {path})
                .del(['files', 'selected', ...pathSections])
                .dispatch()
        } else {
            actionBuilder('SELECT_ITEM', {path})
                .set(['files', 'selected', ...pathSections], true)
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
                return selected[pathSections[0]] === true
            }
            const pathSection = pathSections.splice(0, 1)
            return isSelected(pathSections, selected[pathSection])
        }
        const pathSections = this.pathSections(path)
        const selected = this.props.files.selected
        return isSelected(pathSections, selected)
    }
    toggleDirectory(path) {
        const directory = this.props.files[path]
        if (directory && !directory.collapsed) {
            this.collapseDirectory(path)
        } else {
            this.expandDirectory(path)
            this.loadDirectory(path)
        }
    }
    pathSections(path) {
        return path.substr(1).split('/')
    }
    renderFileInfo(fullPath, file) {
        if (file.isDirectory) {
            const files = this.props.files[fullPath] && this.props.files[fullPath].files
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
            : <Icon name={isImage(path) ? 'file-image-o' : 'file'} className={styles.icon}/>
    }
    renderDirectoryIcon(path) {
        const directory = this.props.files[path]
        const expanded = directory && !directory.collapsed
        if (expanded && !directory.files) {
            return <Icon name={'spinner'} className={styles.icon}/>
        } else {
            const className = expanded ? styles.expanded : styles.collapsed
            return <Icon name={'chevron-right'} 
                className={[styles.icon, styles.directory, className].join(' ')}
                onClick={(e) => {
                    e.stopPropagation()
                    this.toggleDirectory(path)}
                }/>
        }
    }
    renderList(path) {
        const directory = this.props.files[path]
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
                        onClick={() => this.toggleSelection(fullPath)}>
                        {this.renderIcon(fullPath, file)}
                        <span className={styles.fileName}>{file.name}</span>
                        {this.renderFileInfo(fullPath, file)}
                    </div>
                    {this.renderList(fullPath)}
                </li>
            )
        }) : null
    }
    render() {
        return (
            <div>
                <h1>Browse</h1>
                <div className={styles.controls}>
                    <Tooltip msg='browse.controls.remove' top>
                        <IconButton icon='trash-o' onClick={this.removeSelection}/>
                    </Tooltip>
                    <Tooltip msg='browse.controls.download' top>
                        <IconButton icon='download' onClick={this.downloadSelection}/>
                    </Tooltip>
                    <Tooltip msg='browse.controls.clearSelection' top>
                        <IconButton icon='times' onClick={this.clearSelection}/>
                    </Tooltip>
                </div>
                {this.renderList('/')}
            </div>
        )
    }
}

Browse.propTypes = {
    action: PropTypes.func,
    currentPath: PropTypes.string,
    files: PropTypes.objectOf(
        PropTypes.shape({
            open: PropTypes.bool,
            files: PropTypes.arrayOf(PropTypes.object)
        })
    ),
    asyncActionBuilder: PropTypes.func
}

export default connect(mapStateToProps)(Browse)