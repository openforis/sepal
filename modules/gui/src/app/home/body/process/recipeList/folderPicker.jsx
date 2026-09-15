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
        const {projects} = this.props
        const {folderId} = this.state
        const options = this.getOptions()
        return (
            <Layout type='vertical' spacing='tight'>
                <Breadcrumb
                    projects={projects}
                    folderId={folderId}
                    onNavigate={next => this.setState({folderId: next})}
                />
                {options.length
                    ? options.map(folder => this.renderOption(folder))
                    : <NoData message={msg('process.projects.noProjects')}/>}
                <Button
                    look='apply'
                    shape='pill'
                    label={msg('process.project.selectHere')}
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

    // A folder cannot be moved into itself or below itself, so those destinations are never offered.
    getOptions() {
        const {projects, excludeFolderId} = this.props
        const {folderId} = this.state
        return childFolders(projects, folderId)
            .filter(folder => !excludeFolderId || !isSelfOrDescendant(projects, folder.id, excludeFolderId))
    }
}

FolderPicker.propTypes = {
    projects: PropTypes.array.isRequired,
    onSelect: PropTypes.func.isRequired,
    excludeFolderId: PropTypes.string
}
