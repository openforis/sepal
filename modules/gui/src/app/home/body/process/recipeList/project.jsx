import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './project.module.css'

const fields = {
    name: new Form.Field()
        .notBlank('process.project.form.name.required')
        .predicate((name, {projectNames}) => !projectNames.includes(name.toLowerCase()), 'process.project.form.name.unique')
}

const mapStateToProps = (state, ownProps) => {
    const project = ownProps.project
    const projectNames = ownProps.projectNames
    return {
        values: {
            id: project && project.id,
            name: (project && project.name) || '',
            projectNames: projectNames
        }
    }
}

class _Project extends React.Component {
    renderPanel() {
        const {inputs: {name}} = this.props
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
                form={form}
                isActionForm={true}
                statePath='project'
                modal
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
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
}
