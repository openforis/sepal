import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './folderForm.module.css'

// Long enough for any name worth reading, short enough that a row, a breadcrumb and a dialog can still
// show it whole. The column holds 255.
const NAME_MAX_LENGTH = 50

const fields = {
    name: new Form.Field()
        .notBlank('process.folder.form.name.required')
        .maxLength(NAME_MAX_LENGTH)
        .predicate((name, {folderNames}) => !folderNames.includes(name.toLowerCase()), 'process.folder.form.name.unique')
}

const mapStateToProps = (state, ownProps) => {
    const folder = ownProps.folder
    const folderNames = ownProps.folderNames
    return {
        values: {
            id: folder && folder.id,
            name: (folder && folder.name) || '',
            folderNames: folderNames
        }
    }
}

// The form names a folder and nothing else. A folder moves by drag and drop, and a new one lands in
// the folder that is open, so neither needs a parent to choose here.
class _FolderForm extends React.Component {
    renderPanel() {
        const {inputs: {name}} = this.props
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
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </React.Fragment>
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
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
}
