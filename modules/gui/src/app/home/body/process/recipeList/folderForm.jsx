import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {ButtonPopup} from '~/widget/buttonPopup'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './folderForm.module.css'
import {FolderPicker} from './folderPicker'
import {folderPathLabel} from './recipeTree'

const fields = {
    name: new Form.Field()
        .notBlank('process.folder.form.name.required')
        .predicate((name, {folderNames}) => !folderNames.includes(name.toLowerCase()), 'process.folder.form.name.unique'),
    parentId: new Form.Field()
}

const mapStateToProps = (state, ownProps) => {
    const folder = ownProps.folder
    const folderNames = ownProps.folderNames
    return {
        values: {
            id: folder && folder.id,
            name: (folder && folder.name) || '',
            parentId: (folder && folder.parentId) || null,
            folderNames: folderNames
        }
    }
}

class _FolderForm extends React.Component {
    renderPanel() {
        const {parentEditable, inputs: {name}} = this.props
        return (
            <React.Fragment>
                <Panel.Content>
                    <Layout>
                        <Form.Input
                            label={msg('process.folder.form.name.label')}
                            autoFocus
                            input={name}
                            spellCheck={false}
                        />
                        {parentEditable ? this.renderParent() : null}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </React.Fragment>
        )
    }

    renderParent() {
        const {folders, folder, inputs: {parentId}} = this.props
        return (
            <Widget label={msg('process.folder.form.parent.label')}>
                <ButtonPopup
                    shape='pill'
                    label={parentId.value
                        ? folderPathLabel(folders, parentId.value)
                        : msg('process.folder.parent.root')}
                    vPlacement='below'
                    hPlacement='over-right'>
                    {onBlur => (
                        <FolderPicker
                            folders={folders}
                            excludeFolderId={folder.id}
                            onSelect={folderId => {
                                parentId.set(folderId)
                                onBlur()
                            }}
                        />
                    )}
                </ButtonPopup>
            </Widget>
        )
    }

    render() {
        const {form, onApply, onCancel} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                isActionForm={true}
                statePath='folder'
                onApply={folder => onApply(folder)}
                onCancel={onCancel}>
                <Panel.Header
                    icon='folder-open'
                    title={msg('process.folder.title')}/>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

export const FolderForm = compose(
    _FolderForm,
    withForm({fields, mapStateToProps})
)

FolderForm.propTypes = {
    folder: PropTypes.object.isRequired,
    folderNames: PropTypes.array.isRequired,
    parentEditable: PropTypes.any,
    folders: PropTypes.array.isRequired,
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
}
