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

import {FolderPicker} from './folderPicker'
import styles from './project.module.css'
import {folderPathLabel} from './recipeTree'

const fields = {
    name: new Form.Field()
        .notBlank('process.project.form.name.required')
        .predicate((name, {projectNames}) => !projectNames.includes(name.toLowerCase()), 'process.project.form.name.unique'),
    parentId: new Form.Field()
}

const mapStateToProps = (state, ownProps) => {
    const project = ownProps.project
    const projectNames = ownProps.projectNames
    return {
        values: {
            id: project && project.id,
            name: (project && project.name) || '',
            parentId: (project && project.parentId) || null,
            projectNames: projectNames
        }
    }
}

class _Project extends React.Component {
    renderPanel() {
        const {parentEditable, inputs: {name}} = this.props
        return (
            <React.Fragment>
                <Panel.Content>
                    <Layout>
                        <Form.Input
                            label={msg('process.project.form.name.label')}
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
        const {projects, project, inputs: {parentId}} = this.props
        return (
            <Widget label={msg('process.project.form.parent.label')}>
                <ButtonPopup
                    shape='pill'
                    label={parentId.value
                        ? folderPathLabel(projects, parentId.value)
                        : msg('process.project.parent.root')}
                    vPlacement='below'
                    hPlacement='over-right'>
                    {onBlur => (
                        <FolderPicker
                            projects={projects}
                            excludeFolderId={project.id}
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
                statePath='project'
                onApply={project => onApply(project)}
                onCancel={onCancel}>
                <Panel.Header
                    icon='diagram-project'
                    title={msg('process.project.title')}/>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

export const Project = compose(
    _Project,
    withForm({fields, mapStateToProps})
)

Project.propTypes = {
    project: PropTypes.object.isRequired,
    projectNames: PropTypes.array.isRequired,
    parentEditable: PropTypes.any,
    projects: PropTypes.array.isRequired,
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
}
