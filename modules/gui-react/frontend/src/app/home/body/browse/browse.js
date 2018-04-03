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
        this.props.asyncActionBuilder('LOAD_DIR',
            loadFiles$(path))
            .dispatch()
    }
    collapseDir(path) {
        actionBuilder('COLLAPSE_DIR')
            .set(['files', path, 'collapsed'], true)
            .dispatch()
    }
    expandDir(path) {
        actionBuilder('EXPAND_DIR')
            .set(['files', path, 'collapsed'], false)
            .dispatch()
    }
    click(path, file) {
        if (file && file.isDirectory) {
            this.clickDir(path, file.name)
        }
    }
    clickDir(path, name) {
        const subPath = this.subPath(path, name)
        const directory = this.props.files[subPath]
        if (directory && !directory.collapsed) {
            this.collapseDir(subPath)
        } else {
            this.expandDir(subPath)
            this.load(subPath)
        }
    }
    subPath(path, dir) {
        return Path.normalize(path + '/' + dir)
    }
    renderIcon(path, file) {
        if (file.isDirectory) {
            const directory = this.props.files[this.subPath(path, file.name)]
            if (directory && !directory.collapsed && !directory.files) {
                return <Icon className={styles.icon} name={'spinner'}/>
            } else {
                return <Icon name={'chevron-right'} className={[styles.icon, directory && !directory.collapsed ? styles.openDirectory : styles.closedDirectory].join(' ')}/>
            }
        } else {
            return <Icon className={styles.icon} name={'file'}/>
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
                <div onClick={() => this.click(path, file)}>
                    {this.renderIcon(path, file)}
                    <span className={styles.fileName}>{file.name}</span>
                </div>
                {this.renderList(this.subPath(path, file.name))}
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