import _ from 'lodash'
import moment from 'moment'
import {orderBy} from 'natural-orderby'
import Path from 'path'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withEnableDetector} from '~/enabled'
import format from '~/format'
import {getLogger} from '~/log'
import {dotSafe} from '~/stateUtils'
import {select} from '~/store'
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
import {Tabs} from '~/widget/tabs/tabs'
import {ToggleButton} from '~/widget/toggleButton'

const log = getLogger('browse')

import styles from './browse.module.css'

const ANIMATION_DURATION_MS = 1000

const basePath = id => ['browse', id]
const TREE = 'tree'
const SHOW_DOT_FILES = 'showDotFiles'
const SPLIT_DIRS = 'splitDirs'
const SORTING = 'sorting'

const mapStateToProps = (state, ownProps) => ({
    tree: select([basePath(ownProps.id), TREE]) || {},
    showDotFiles: select([basePath(ownProps.id), SHOW_DOT_FILES]),
    splitDirs: select([basePath(ownProps.id), SPLIT_DIRS]),
    sorting: select([basePath(ownProps.id), SORTING]) || {sortingOrder: 'name', sortingDirection: 1}
})

const pathSections = path =>
    path.split('/').splice(1)

const treePath = (path = '/') =>
    path !== '/'
        ? pathSections(path).reduce(
            (treePath, pathElement) => treePath.concat(['items', pathElement]), []
        ) : []

class _FileBrowser extends React.Component {

    userFiles = api.userFiles.userFiles()

    constructor() {
        super()
        this.onUpdate = this.onUpdate.bind(this)
        this.removeSelected = this.removeSelected.bind(this)
        this.clearSelection = this.clearSelection.bind(this)
        this.toggleDotFiles = this.toggleDotFiles.bind(this)
        this.toggleSplitDirs = this.toggleSplitDirs.bind(this)
        this.setSorting = this.setSorting.bind(this)
    }

    componentDidMount() {
        const {addSubscription, enableDetector: {onChange}} = this.props
        onChange(enabled => this.enabled(enabled))
        addSubscription(
            this.userFiles.downstream$.subscribe({
                next: msg => this.onMessage(msg),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    reset() {
        const {id} = this.props
        actionBuilder('RESET_TREE')
            .set([basePath(id), TREE], {})
            .dispatch()
    }

    onMessage({ready, data}) {
        ready !== undefined && this.onReady(ready)
        data !== undefined && this.onUpdate(data)
    }

    onReady(ready) {
        // console.log({ready})
    }

    onUpdate({path, items}) {
        if (this.isDirectoryExpanded(path) || path === '/') {
            const {id} = this.props
            const node = this.getNode(path)

            if (node.items) {
                Object.entries(items).forEach(([name, item]) => {
                    item.items = node.items[name]?.items
                    item.opened = node.items[name]?.opened
                })
            }

            actionBuilder('UPDATE_TREE')
                .assign([basePath(id), TREE, dotSafe(treePath(path))], {
                    items,
                    opened: true,
                    selected: _.pick(node.selected || {}, Object.keys(items))
                })
                .dispatch()
        }
    }

    enabled(enabled) {
        if (enabled) {
            this.userFiles.upstream$.next({
                monitor: this.getOpenDirs()
            })
        } else {
            this.userFiles.upstream$.next({
                unmonitor: '/'
            })
        }
    }

    childPath(path = '/', name = '/') {
        return Path.join(path, name)
    }

    parentPath(path = '/') {
        return Path.dirname(path)
    }

    parsePath(path = '/') {
        return {dir: Path.dirname(path), base: Path.basename(path)}
    }

    getNode(path) {
        const {tree} = this.props
        return _.get(tree, treePath(path), tree)
    }

    getFiles(path) {
        return this.getNode(path).items
    }

    removePaths(paths) {
        const {id} = this.props
        actionBuilder('REMOVE_PATH_PENDING', {paths})
            .forEach(paths, (actionBuilder, path) =>
                actionBuilder.set([basePath(id), TREE, dotSafe(treePath(path)), 'removing'], true)
            )
            .dispatch()

        this.userFiles.upstream$.next({remove: paths})
    }

    pruneRemovedNodes(actionBuilder, path) {
        const {id} = this.props
        _.forEach(this.getFiles(path), (file, name) => {
            const childPath = this.childPath(path, name)
            if (file.removed) {
                actionBuilder.del([basePath(id), TREE, dotSafe(treePath(childPath))])
            } else if (this.isDirectory(file)) {
                this.pruneRemovedNodes(actionBuilder, childPath)
            }
        })
        return actionBuilder
    }

    isDirectory(directory) {
        return !!directory.dir
    }

    toggleDirectory(path, directory) {
        if (this.isDirectoryExpanded(path)) {
            this.collapseDirectory(path, directory)
        } else {
            this.expandDirectory(path, directory)
        }
    }

    isDirectoryExpanded(path) {
        return !!this.getNode(path).opened
    }

    getOpenSubDirs(path) {
        const node = this.getNode(path)
        return node.items
            ? Object.entries(node.items)
                .filter(([_name, {dir, opened}]) => dir && opened)
                .map(([name]) => Path.resolve(path, name))
                .flatMap(path => [path, ...this.getOpenSubDirs(path)])
            : []
    }

    getOpenDirs(path = '/') {
        return [path, ...this.getOpenSubDirs(path)]
    }

    expandDirectory(path) {
        const {id} = this.props
        actionBuilder('EXPAND_DIRECTORY')
            .set([basePath(id), TREE, dotSafe(treePath(path)), 'opened'], true)
            .dispatch()
        this.userFiles.upstream$.next({monitor: this.getOpenDirs(path)})
    }

    collapseDirectory(path) {
        const {id} = this.props
        const ab = actionBuilder('COLLAPSE_DIRECTORY', {path})
        this.deselectDescendants(ab, path)
        ab
            .del([basePath(id), TREE, dotSafe(treePath(path)), 'opened'])
            .dispatch()
        this.userFiles.upstream$.next({unmonitor: path})
    }

    toggleSelected(path) {
        this.isSelected(path)
            ? this.deselectItem(path)
            : this.selectItem(path)
    }

    isSelected(path) {
        const {dir, base} = this.parsePath(path)
        return _.get(this.getNode(dir).selected, base)
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
            this.deselectItem(parentPath)
            this.deselectAncestors(actionBuilder, parentPath)
        }
        return actionBuilder
    }

    deselectDescendants(actionBuilder, path) {
        const {id} = this.props
        _.forEach(this.getFiles(path), (file, name) => {
            const childPath = this.childPath(path, name)
            actionBuilder.del([basePath(id), TREE, dotSafe(treePath(path)), 'selected', dotSafe(name)])
            if (this.isDirectory(file)) {
                this.deselectDescendants(actionBuilder, childPath)
            }
        })
        return actionBuilder
    }

    selectItem(path) {
        const {id} = this.props
        const deselectHierarchy = (actionBuilder, path) => {
            this.deselectAncestors(actionBuilder, path)
            this.deselectDescendants(actionBuilder, path)
            return actionBuilder
        }
        const {dir, base} = this.parsePath(path)
        deselectHierarchy(actionBuilder('SELECT_ITEM', {path}), path)
            .set([basePath(id), TREE, dotSafe(treePath(dir)), 'selected', dotSafe(base)], true)
            .dispatch()
    }

    deselectItem(path) {
        const {id} = this.props
        const {dir, base} = this.parsePath(path)
        actionBuilder('DESELECT_ITEM', {path})
            .del([basePath(id), TREE, dotSafe(treePath(dir)), 'selected', dotSafe(base)])
            .dispatch()
    }

    clearSelection() {
        this.deselectDescendants(actionBuilder('CLEAR_SELECTION'))
            .dispatch()
    }

    selectedItems(path = '/', selected = {files: [], directories: []}) {
        _.transform(this.getFiles(path), (selected, file, name) => {
            const childPath = this.childPath(path, name)
            if (this.isSelected(childPath)) {
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

    countSelectedItems() {
        const {files, directories} = this.selectedItems()
        return {
            files: files.length,
            directories: directories.length
        }
    }

    toggleDotFiles() {
        const {showDotFiles, id} = this.props
        const show = !showDotFiles
        actionBuilder('SET_SHOW_DOT_FILES', {show})
            .set([basePath(id), SHOW_DOT_FILES], show)
            .dispatch()
    }

    toggleSplitDirs() {
        const {splitDirs, id} = this.props
        actionBuilder('TOGGLE_SPLIT_DIRS')
            .set([basePath(id), SPLIT_DIRS], !splitDirs)
            .dispatch()
    }

    removeInfo() {
        const selected = this.countSelectedItems()
        return msg('browse.removeConfirmation', {
            files: selected.files,
            directories: selected.directories
        })
    }

    renderToolbar() {
        const {showDotFiles, splitDirs, sorting: {sortingOrder, sortingDirection}} = this.props
        const selected = this.countSelectedItems()
        const nothingSelected = selected.files === 0 && selected.directories === 0
        const oneFileSelected = selected.files === 1 && selected.directories === 0
        const selectedFiles = this.selectedItems().files
        const selectedFile = selectedFiles.length === 1 && selectedFiles[0]
        const downloadUrl = selectedFile && api.userFiles.downloadUrl(selectedFile)
        const downloadFilename = selectedFiles.length === 1 && Path.basename(selectedFile)
        return (
            <ButtonGroup layout='horizontal-nowrap'>
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
                <ButtonGroup spacing='tight'>
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
            </ButtonGroup>
        )
    }

    setSorting(sortingOrder, sortingDirection) {
        const {id} = this.props
        actionBuilder('SET_SORTING', {sortingOrder, sortingDirection})
            .set([basePath(id), SORTING], {sortingOrder, sortingDirection})
            .dispatch()

    }

    renderNodeInfo(file) {
        return this.isDirectory(file)
            ? this.renderDirectoryInfo(file)
            : this.renderFileInfo(file)
    }

    renderFileInfo(file) {
        const info = [
            format.fileSize(file.size, {unit: 'bytes'}),
            moment(file.mtime).fromNow()
        ].join(', ')
        return (
            <span className={styles.fileInfo}>
                {info}
            </span>
        )
    }

    renderDirectoryInfo(file) {
        return (
            <span className={styles.fileInfo}>
                {moment(file.mtime).fromNow()}
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
        const busy = expanded && !directory.items
        return (
            <span
                className={[styles.icon, styles.directory].join(' ')}
                onClick={toggleDirectory}>
                <Icon
                    name={'chevron-right'}
                    className={expanded ? styles.expanded : styles.collapsed}
                    attributes={{
                        fade: busy
                    }}
                />
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
                <Icon name='spinner'/>
            </span>
        )
    }

    renderList(path, tree, depth = 0) {
        const {items} = tree
        return items && this.isDirectoryExpanded(path) ? (
            <ul>
                {this.renderListItems(path, items, depth)}
            </ul>
        ) : null
    }

    renderListItem(path, depth, fileName, file) {
        const fullPath = this.childPath(path, file ? fileName : null)
        const isSelected = this.isSelected(fullPath) || this.isAncestorSelected(fullPath)
        const isAdded = file.added
        const isRemoving = file.removing
        return (
            <li key={fileName}>
                <div
                    className={[
                        lookStyles.look,
                        isSelected ? lookStyles.highlight : lookStyles.transparent,
                        isSelected ? null : lookStyles.chromeless,
                        isAdded ? styles.added : null,
                        isRemoving ? styles.removing : null
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
    }

    getSorter() {
        const {splitDirs, sorting: {sortingOrder, sortingDirection}} = this.props
        const orderMap = {
            '-1': 'desc',
            '1': 'asc'
        }

        const dirSorter = {
            order: splitDirs ? ([_, {dir}]) => dir : null,
            direction: splitDirs ? 'desc' : null
        }

        const nameSorter = {
            order: ([name]) => name,
            direction: orderMap[sortingDirection]
        }

        const dateSorter = {
            order: ([_, {mtime}]) => mtime,
            direction: orderMap[-sortingDirection]
        }

        const naturalSortingDirectoriesFirst = items =>
            orderBy(
                items,
                _.compact([dirSorter.order, nameSorter.order]),
                _.compact([dirSorter.direction, nameSorter.direction])
            )

        const dateSortingDirectoriesFirst = items =>
            orderBy(
                items,
                _.compact([dirSorter.order, dateSorter.order]),
                _.compact([dirSorter.direction, dateSorter.direction])
            )

        const sortingMap = {
            name: naturalSortingDirectoriesFirst,
            date: dateSortingDirectoriesFirst
        }

        return sortingMap[sortingOrder]
    }

    renderListItems(path, items, depth) {
        const {showDotFiles} = this.props
        const sorter = this.getSorter()
        return items
            ? _.chain(items)
                .pickBy(file => file)
                .toPairs()
                .thru(sorter)
                .filter(([fileName]) => showDotFiles || !fileName.startsWith('.'))
                .map(([fileName, file]) => this.renderListItem(path, depth, fileName, file)).value()
            : null
    }

    renderInfo() {
        const selected = this.countSelectedItems()
        return (
            <div className={styles.info}>
                {msg('browse.selected', {
                    files: selected.files,
                    directories: selected.directories
                })}
            </div>
        )
    }

    render() {
        return (
            <SectionLayout>
                <Content className={styles.browse} menuPadding horizontalPadding verticalPadding>
                    {this.renderHeader()}
                    {this.renderTree()}
                </Content>
            </SectionLayout>
        )
    }

    renderHeader() {
        return (
            <Layout type='horizontal'>
                {this.renderInfo()}
                <Layout type='horizontal' spacing='none'>
                    {this.renderToolbar()}
                </Layout>
            </Layout>
        )
    }

    renderTree() {
        const {tree} = this.props
        return (
            <Scrollable direction='xy' className={styles.fileList}>
                {this.renderList('/', tree)}
            </Scrollable>
        )
    }
}

const FileBrowser = compose(
    _FileBrowser,
    connect(mapStateToProps),
    withEnableDetector(),
    withSubscriptions()
)

FileBrowser.propTypes = {
    id: PropTypes.string,
    tree: PropTypes.object
}

export class Browse extends React.Component {
    render() {
        return (
            <Tabs
                label={msg('home.sections.browse')}
                statePath='terminal'>
                {({id}) => <FileBrowser id={id}/>}
            </Tabs>
        )
    }
}
