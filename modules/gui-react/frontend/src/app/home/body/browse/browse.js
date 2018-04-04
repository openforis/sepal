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
        this.load('/')
    }
    load(path) {
        this.props.asyncActionBuilder('LOAD_DIR', loadFiles$(path))
            .dispatch()
    }
    collapseDir(path) {
        actionBuilder('COLLAPSE_DIR')
            .set(['files', path, 'collapsed'], true)
            .dispatch()
    }
    expandDir(path) {
        actionBuilder('EXPAND_DIR')
            .del(['files', path, 'collapsed'])
            .dispatch()
    }
    toggleSelection(path, file) {
        const fullPath = this.fullPath(path, file)
        
        if (this.isSelected(path, file)) {
            actionBuilder('DESELECT_ITEM', {fullPath})
                .delValue(['files', 'selected'], fullPath)
                .dispatch()
        } else {
            actionBuilder('SELECT_ITEM', {fullPath})
                .pushIfMissing(['files', 'selected'], fullPath)
                .dispatch()
        }
    }
    isSelected(path, file) {
        const fullPath = this.fullPath(path, file)
        if (fullPath === '/') {
            return false
        } else {
            return this.props.files.selected 
                && (this.props.files.selected.includes(fullPath) || this.isSelected(Path.dirname(fullPath)))
        }
    }
    click(path, file) {
        const fullPath = this.fullPath(path, file)
        if (file && file.isDirectory) {
            this.clickDir(fullPath)
        }
    }
    clickDir(path) {
        const directory = this.props.files[path]
        if (directory && !directory.collapsed) {
            this.collapseDir(path)
        } else {
            this.expandDir(path)
            this.load(path)
        }
    }
    fullPath(path, file) {
        return Path.normalize(path + (file ? '/' + file.name : ''))
    }
    renderIcon(path, file) {
        if (file.isDirectory) {
            const fullPath = this.fullPath(path, file)
            const directory = this.props.files[fullPath]
            const expanded = directory && !directory.collapsed
            if (expanded && !directory.files) {
                return <Icon name={'spinner'}/>
            } else {
                const className = expanded ? styles.expanded : styles.collapsed
                return <Icon name={'chevron-right'} 
                    className={[styles.directory, className].join(' ')}
                    onClick={() => this.click(path, file)}/>
            }
        } else {
            return <Icon name={'file'}/>
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
        return files ? files.map((file) => (
            <li key={file.name}>
                <div className={this.isSelected(path, file) ? styles.selected : null}>
                    <span className={styles.icon}>{this.renderIcon(path, file)}</span>
                    <span className={styles.fileName} onClick={() => this.toggleSelection(path, file)}>{file.name}</span>
                </div>
                {this.renderList(this.fullPath(path, file))}
            </li>
        )) : null
    }
    render() {
        return (
            <div>
                <h1>Browse</h1>
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