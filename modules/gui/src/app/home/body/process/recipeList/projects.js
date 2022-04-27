import {Activator, activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {CrudItem} from 'widget/crudItem'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect, select} from 'store'
import {map} from 'rxjs'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import Notifications from 'widget/notifications'
import Project from './project'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'
import styles from './projects.module.css'

const mapStateToProps = () => ({
    projects: select('process.projects')
})

class _Projects extends React.Component {
    state = {
        selectedProject: null
    }

    newProject() {
        this.editProject({id: uuid()})
    }

    updateProject(project) {
        this.props.stream('REQUEST_UPDATE_PROJECT',
            api.project.save$(project),
            projects => {
                actionBuilder('UPDATE_PROJECT', {project})
                    .set('process.projects', projects)
                    .dispatch()
                Notifications.success({message: msg('process.project.update.success')})
            },
            error => Notifications.error({message: msg('process.project.update.error'), error})
        )
        this.editProject(null)
    }

    removeProject(project) {
        const {id} = project
        this.props.stream('REQUEST_REMOVE_PROJECT',
            api.project.remove$(id),
            projects => {
                actionBuilder('REMOVE_PROJECT', {project})
                    .set('process.projects', projects)
                    .dispatch()
                Notifications.success({message: msg('process.project.remove.success')})
            },
            error => Notifications.error({message: msg('process.project.remove.error'), error})
        )
    }

    editProject(project) {
        this.setState({
            selectedProject: project
        })
    }

    renderProjects() {
        const {projects} = this.props
        if (projects.length) {
            return (
                <Layout type='vertical' spacing='tight'>
                    {projects.map((project, index) => this.renderProject(project, index))}
                </Layout>
            )
        } else {
            return (
                <NoData message={msg('process.projects.noProjects')}/>
            )
        }
    }

    renderProject(project, index) {
        return (
            <ListItem
                key={index}>
                <CrudItem
                    title={project.name}
                    // timestamp={creationTime}
                    editTooltip={msg('process.project.edit.tooltip')}
                    removeTooltip={msg('process.project.remove.tooltip')}
                    onEdit={() => this.editProject(project)}
                    onRemove={() => this.removeProject(project)}
                />
            </ListItem>
        )
    }

    renderProjectsPanel() {
        const {activatable: {deactivate}} = this.props
        const close = deactivate
        const add = () => this.newProject()
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='folder-tree'
                    title={msg('process.projects.title')}
                />
                <Panel.Content>
                    {this.renderProjects()}
                </Panel.Content>
                <Panel.Buttons onEnter={close} onEscape={close}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={close}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Add
                            label={msg('process.projects.add')}
                            icon='pencil-alt'
                            onClick={add}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderProjectPanel(project) {
        return (
            <Project
                project={project}
                onApply={project => this.updateProject(project)}
                onCancel={() => this.editProject()}
            />
        )
    }

    render() {
        const {projects} = this.props
        const {selectedProject} = this.state
        if (projects) {
            return selectedProject
                ? this.renderProjectPanel(selectedProject)
                : this.renderProjectsPanel()
        } else {
            return null
        }
    }

    componentDidMount() {
        const {projects, stream} = this.props
        if (!projects) {
            stream('LOAD_PROJECTS',
                api.project.loadAll$().pipe(
                    map(projects =>
                        actionBuilder('SET_PROJECTS', {projects})
                            .set('process.projects', projects)
                            .dispatch()
                    )
                ),
                null,
                () => Notifications.error({message: msg('process.project.loadingError'), timeout: -1})
            )
        }
    }
}

const policy = () => ({_: 'disallow'})

const Projects = compose(
    _Projects,
    connect(mapStateToProps),
    activatable({id: 'projects', policy, alwaysAllow: true})
)

Projects.propTypes = {
    className: PropTypes.string
}

class _ProjectsButton extends React.Component {
    render() {
        return (
            <React.Fragment>
                <Projects/>
                <Activator id='projects'>
                    {({active, activate}) =>
                        <Button
                            look='transparent'
                            size='large'
                            shape='pill'
                            icon='folder-tree'
                            label={msg('process.projects.label')}
                            tooltip={msg('process.projects.tooltip')}
                            tooltipPlacement='top'
                            tooltipDisabled={active}
                            disabled={active}
                            onClick={() => activate()}
                        />
                    }
                </Activator>
            </React.Fragment>
        )
    }
}

export const ProjectsButton = compose(
    _ProjectsButton,
    activator('projects')
)
