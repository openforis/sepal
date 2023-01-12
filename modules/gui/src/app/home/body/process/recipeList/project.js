import {Form, withForm} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './project.module.css'

const fields = {
    name: new Form.Field()
        .notBlank('project.form.name.required')
}
const mapStateToProps = (state, ownProps) => {
    const project = ownProps.project
    return {
        values: {
            id: project && project.id,
            name: (project && project.name) || ''
        }
    }
}

class Project extends React.Component {
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

Project.propTypes = {
    project: PropTypes.object.isRequired,
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
}

export default compose(
    Project,
    withForm({fields, mapStateToProps})
)
