import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Scrollable} from '~/widget/scrollable'
import {Tooltip} from '~/widget/tooltip'

import styles from './folderPicker.module.css'
import {at, childFolders, isSelfOrDescendant, parentFolderId, ROOT} from './recipeTree'

export class FolderPicker extends React.Component {
    state = {folderId: ROOT}

    render() {
        const {folderId} = this.state
        return (
            <div className={styles.picker}>
                {this.renderCurrentFolder()}
                {this.renderOptions()}
                <Button
                    look='apply'
                    icon='check'
                    additionalClassName={styles.select}
                    label={msg('process.folder.selectHere')}
                    onClick={() => this.props.onSelect(folderId)}
                />
            </div>
        )
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
                    onClick={() => this.setState({folderId: parentFolderId(folders, folderId)})}
                />
                <Tooltip msg={this.currentFolderName()}>
                    <div className={styles.folder}>{this.currentFolderName()}</div>
                </Tooltip>
            </Layout>
        )
    }

    // One box of one size, whatever the open folder holds, so walking the tree never moves the
    // button under the pointer.
    renderOptions() {
        const options = this.getOptions()
        return (
            <div className={styles.options}>
                <Scrollable direction='y'>
                    {options.length
                        ? (
                            <div className={styles.rows}>
                                {options.map(folder => this.renderOption(folder))}
                            </div>
                        )
                        : <NoData message={msg('process.folder.none')}/>}
                </Scrollable>
            </div>
        )
    }

    renderOption(folder) {
        return (
            <ListItem key={folder.id} onClick={() => this.setState({folderId: folder.id})}>
                <CrudItem
                    icon='folder-open'
                    iconVariant='info'
                    title={folder.name}
                    titleTooltip={folder.name}
                />
            </ListItem>
        )
    }

    currentFolderName() {
        const {folders} = this.props
        const {folderId} = this.state
        return folders.find(({id}) => id === at(folderId))?.name ?? msg('process.recipeList.root')
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
    onSelect: PropTypes.func.isRequired,
    excludeFolderIds: PropTypes.array
}
