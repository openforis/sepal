import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {map, switchMap, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {Tag} from '~/widget/tag'

import {Project} from './project'
import styles from './projects.module.css'
import {RecipeListConfirm} from './recipeListConfirm'

const mapStateToProps = () => ({
    projects: select('process.projects'),
    projectId: select('process.projectId'),
    recipes: select('process.recipes'),
})

class _Projects extends React.Component {
    state = {
        editProject: null
    }

    constructor() {
        super()
        this.close = this.close.bind(this)
    }

    newProject() {
        this.editProject({id: uuid()})
    }

    updateProject(project) {
        this.props.stream('REQUEST_UPDATE_PROJECT',
            updateProject$(project),
            () => {},
            error => Notifications.error({message: msg('process.project.update.error'), error})
        )
        this.editProject(null)
    }

    removeProject(project) {
        const {id} = project
        this.props.stream('REQUEST_REMOVE_PROJECT',
            api.project.remove$(id).pipe(
                switchMap(projects =>
                    api.recipe.loadAll$().pipe(
                        map(recipes => ({projects, recipes}))
                    )
                )
            ),
            ({projects, recipes}) => {
                actionBuilder('REMOVE_PROJECT', {project, recipes})
                    .set('process.projects', projects)
                    .set('process.recipes', recipes)
                    .dispatch()
            },
            error => Notifications.error({message: msg('process.project.remove.error'), error})
        )
    }

    editProject(project) {
        this.setState({
            editProject: project
        })
    }

    selectProject(projectId) {
        projectId
            ? actionBuilder('SELECT_PROJECT', {projectId})
                .set('process.projectId', projectId)
                .dispatch()
            : actionBuilder('DESELECT_PROJECT')
                .del('process.projectId')
                .dispatch()
        this.close()
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

    renderSelected() {
        return (
            <Tag size='small' label={msg('process.projects.selected')}/>
        )
    }

    renderProject(project, index) {
        const {projectId} = this.props
        const projectRecipes = this.getProjectRecipes(project)
        return (
            <ListItem
                key={index}
                onClick={() => this.selectProject(project.id)}>
                <CrudItem
                    title={project.name}
                    editTooltip={msg('process.project.edit.tooltip')}
                    removeTooltip={msg('process.project.remove.tooltip')}
                    removeTitle={msg('process.project.remove.title')}
                    removeMessage={msg('process.project.remove.confirm')}
                    removeContent={
                        <RecipeListConfirm recipes={projectRecipes}/>
                    }
                    unsafeRemove={!projectRecipes.length}
                    inlineComponents={projectId === project.id && this.renderSelected()}
                    onEdit={() => this.editProject(project)}
                    onRemove={() => this.removeProject(project)}
                />
            </ListItem>
        )
    }

    renderProjectsPanel() {
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
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Escape', 'Enter']}
                            disabled={this.isBusy()}
                            onClick={this.close}
                        />
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

    isBusy() {
        const {stream} = this.props
        return stream('REQUEST_UPDATE_PROJECT').active || stream('REQUEST_REMOVE_PROJECT').active
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
        const {editProject} = this.state
        if (projects) {
            return editProject
                ? this.renderProjectPanel(editProject)
                : this.renderProjectsPanel()
        } else {
            return null
        }
    }

    getProjectRecipes(project) {
        const {recipes} = this.props
        return recipes.filter(({projectId}) => projectId === project.id)
    }

    close() {
        const {activatable: {deactivate}} = this.props
        deactivate()
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

const updateProject$ = project =>
    api.project.save$(project).pipe(
        tap(projects => {
            actionBuilder('UPDATE_PROJECT', {project})
                .set('process.projects', projects)
                .dispatch()
        })
    )

export const updateProject = project =>
    updateProject$(project)
        .subscribe({
            error: error => Notifications.error({message: msg('process.project.update.error'), error})
        })

export const Projects = compose(
    _Projects,
    connect(mapStateToProps),
    withActivatable({id: 'projects', policy, alwaysAllow: true})
)

Projects.propTypes = {
    className: PropTypes.string
}
