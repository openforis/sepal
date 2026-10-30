import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Scrollable} from '~/widget/scrollable'
import {Tooltip} from '~/widget/tooltip'

import {Separator} from './breadcrumb'
import styles from './folderPicker.module.css'
import {at, childFolders, isSelfOrDescendant, parentFolderId, ROOT} from './recipeTree'

export class FolderPicker extends React.Component {
    state = {folderId: at(this.props.folderId)}

    render() {
        const {className} = this.props
        return (
            <Layout type='vertical' spacing='tight' shrink className={[styles.picker, className].join(' ')}>
                {this.renderCurrentFolder()}
                {this.renderOptions()}
                {this.renderSelectButton()}
            </Layout>
        )
    }

    // A dialog around the picker may carry the action among its own buttons instead.
    renderSelectButton() {
        const {onSelect} = this.props
        const {folderId} = this.state
        return onSelect
            ? (
                <Button
                    look='apply'
                    icon='check'
                    additionalClassName={styles.select}
                    label={msg('process.folder.selectHere')}
                    onClick={() => onSelect(folderId)}
                />
            )
            : null
    }

    // A box this narrow has no room for a path, so it names the folder you are in and offers the way
    // back, one level at a time.
    renderCurrentFolder() {
        const {folders} = this.props
        const {folderId} = this.state
        return (
            <Layout type='horizontal-nowrap' spacing='compact' alignment='left'>
                <Button
                    chromeless
                    shape='circle'
                    size='small'
                    icon='arrow-left'
                    tooltip={msg('process.folder.parent.tooltip')}
                    disabled={at(folderId) === ROOT}
                    onClick={() => this.open(parentFolderId(folders, folderId))}
                />
                {this.renderCurrentFolderName()}
            </Layout>
        )
    }

    // The root is the house and the chevron that marks it a folder, as in the breadcrumb, so a screen reader
    // is told what it stands for.
    renderCurrentFolderName() {
        const {folders} = this.props
        const {folderId} = this.state
        const folder = folders.find(({id}) => id === at(folderId))
        return folder
            ? (
                <Tooltip msg={folder.name}>
                    <div className={styles.folder}>{folder.name}</div>
                </Tooltip>
            )
            : (
                <div className={styles.root} aria-label={msg('process.recipeList.root')}>
                    <Icon name='house'/>
                    <Separator/>
                </div>
            )
    }

    // One box of one size, whatever the open folder holds, so walking the tree never moves the
    // button under the pointer. The rows' Layout sits in a plain div: straight inside the scrolling
    // column, it would shrink to the box rather than scroll.
    renderOptions() {
        const options = this.getOptions()
        return (
            <div className={styles.options}>
                <Scrollable direction='y'>
                    {options.length
                        ? (
                            <div>
                                <Layout type='vertical' spacing='tight' shrink>
                                    {options.map(folder => this.renderOption(folder))}
                                </Layout>
                            </div>
                        )
                        : <NoData message={msg('process.folder.none')}/>}
                </Scrollable>
            </div>
        )
    }

    renderOption(folder) {
        return (
            <ListItem key={folder.id} onClick={() => this.open(folder.id)}>
                <CrudItem
                    icon='folder-open'
                    iconVariant='info'
                    title={folder.name}
                    titleTooltip={folder.name}
                />
            </ListItem>
        )
    }

    open(folderId) {
        const {onNavigate} = this.props
        this.setState({folderId})
        onNavigate && onNavigate(folderId)
    }

    // Nothing inside a folder being moved can be its own destination, so those never appear.
    getOptions() {
        const {folders, excludeFolderIds = []} = this.props
        const {folderId} = this.state
        return childFolders(folders, folderId)
            .filter(folder => !excludeFolderIds.some(excluded => isSelfOrDescendant(folders, folder.id, excluded)))
    }
}

FolderPicker.propTypes = {
    folders: PropTypes.array.isRequired,
    className: PropTypes.string,
    excludeFolderIds: PropTypes.array,
    folderId: PropTypes.string,
    onNavigate: PropTypes.func,
    onSelect: PropTypes.func
}
