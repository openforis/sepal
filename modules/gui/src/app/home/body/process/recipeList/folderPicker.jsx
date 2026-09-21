import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'

import {Breadcrumb} from './breadcrumb'
import folderStyles from './folderItem.module.css'
import {childFolders, isSelfOrDescendant, ROOT} from './recipeTree'

export class FolderPicker extends React.Component {
    state = {folderId: ROOT}

    render() {
        const {folders} = this.props
        const {folderId} = this.state
        const options = this.getOptions()
        return (
            <Layout type='vertical' spacing='tight'>
                <Breadcrumb
                    folders={folders}
                    folderId={folderId}
                    onNavigate={next => this.setState({folderId: next})}
                />
                {options.length
                    ? options.map(folder => this.renderOption(folder))
                    : <NoData message={msg('process.folder.none')}/>}
                <Button
                    look='apply'
                    shape='pill'
                    label={msg('process.folder.selectHere')}
                    onClick={() => this.props.onSelect(folderId)}
                />
            </Layout>
        )
    }

    renderOption(folder) {
        return (
            <ListItem key={folder.id} onClick={() => this.setState({folderId: folder.id})}>
                <CrudItem icon='folder-open' iconClassName={folderStyles.icon} title={folder.name}/>
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
