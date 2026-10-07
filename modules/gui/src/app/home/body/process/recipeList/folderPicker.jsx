import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Scrollable} from '~/widget/scrollable'

import {Breadcrumb} from './breadcrumb'
import styles from './folderPicker.module.css'
import {childFolders, isSelfOrDescendant, ROOT} from './recipeTree'

export class FolderPicker extends React.Component {
    state = {folderId: ROOT}

    render() {
        const {folders} = this.props
        const {folderId} = this.state
        return (
            <Layout type='vertical' spacing='tight' className={styles.picker} contentClassName={styles.content}>
                <Breadcrumb
                    folders={folders}
                    folderId={folderId}
                    onNavigate={next => this.setState({folderId: next})}
                />
                {this.renderOptions()}
                <Button
                    look='apply'
                    shape='pill'
                    width='max'
                    additionalClassName={styles.select}
                    label={msg('process.folder.selectHere')}
                    onClick={() => this.props.onSelect(folderId)}
                />
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
                            <Layout type='vertical' spacing='tight'>
                                {options.map(folder => this.renderOption(folder))}
                            </Layout>
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
                />
            </ListItem>
        )
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
