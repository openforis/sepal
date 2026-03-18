import _ from 'lodash'
import memoizeOne from 'memoize-one'
import PropTypes from 'prop-types'
import React from 'react'
import {map, switchMap, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {simplifyString, splitString} from '~/string'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {CrudItem} from '~/widget/crudItem'
import {FastList} from '~/widget/fastList'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {SearchBox} from '~/widget/searchBox'
import {Tag} from '~/widget/tag'

import {Project} from './project'
import styles from './projects.module.css'
import {RecipeListConfirm} from './recipeListConfirm'

const mapStateToProps = () => ({
    projects: select('process.projects'),
    projectId: select('process.projectId'),
    recipes: select('process.recipes'),
})

const getHighlightMatcher = memoizeOne(
    filterValues => filterValues.length
        ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
        : ''
)

class _Projects extends React.Component {
    state = {
        editProject: null,
        textFilterValues: []
    }

    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
        this.setTextFilter = this.setTextFilter.bind(this)
        this.renderProject = this.renderProject.bind(this)
        this.selectProject = this.selectProject.bind(this)
        this.editProject = this.editProject.bind(this)
        this.updateProject = this.updateProject.bind(this)
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

    selectProject({id: projectId}) {
        projectId
            ? actionBuilder('SELECT_PROJECT', {projectId})
                .set('process.projectId', projectId)
                .dispatch()
            : actionBuilder('DESELECT_PROJECT')
                .del('process.projectId')
                .dispatch()
        this.close()
    }

    renderSearch() {
        return (
            <SearchBox
                placeholder={msg('process.projects.search.placeholder')}
                debounce={0}
                onSearchValue={this.setTextFilter}
            />
        )
    }

    renderProjects() {
        const filteredProjects = this.getFilteredProjects()
        if (filteredProjects.length) {
            const itemKey = project => `${project.id}|${this.getHighlightMatcher()}`
            return (
                <FastList
                    items={filteredProjects}
                    itemKey={itemKey}
                    itemRenderer={this.renderProject}
                    spacing='tight'
                    overflow={50}
                    onEnter={this.selectProject}
                />
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

    renderProject(project, hovered) {
        const {projectId} = this.props
        const projectRecipes = this.getProjectRecipes(project)
        return (
            <ListItem
                key={project.id}
                hovered={hovered}
                onClick={() => this.selectProject(project)}>
                <CrudItem
                    title={project.name}
                    description={msg('process.project.description', {count: projectRecipes.length})}
                    highlight={this.getHighlightMatcher()}
                    editTooltip={msg('process.project.edit.tooltip')}
                    removeTooltip={msg('process.project.remove.tooltip')}
                    removeTitle={projectRecipes.length ? msg('process.project.remove.title') : null}
                    removeMessage={projectRecipes.length ? msg('process.project.remove.confirm') : null}
                    removeContent={projectRecipes.length ? <RecipeListConfirm recipes={projectRecipes}/> : null}
                    inlineComponents={projectId === project.id && this.renderSelected()}
                    onEdit={() => this.editProject(project)}
                    onRemove={() => this.removeProject(project)}
                />
            </ListItem>
        )
    }

    renderProjectsPanel() {
        const {textFilterValues} = this.state
        const add = () => this.newProject()
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={this.close}>
                <Panel.Header
                    icon='folder-tree'
                    title={msg('process.projects.title')}
                />
                <Panel.Content scrollable={false}>
                    <Layout type='vertical' spacing='tight'>
                        {this.renderSearch()}
                        {this.renderProjects()}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={textFilterValues.length ? null : ['Enter', 'Escape']}
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
        const {projects} = this.props
        const projectNames = projects.map(({name}) => name)
        return (
            <Project
                project={project}
                projectNames={projectNames}
                onApply={this.updateProject}
                onCancel={this.editProject}
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

    setTextFilter(textFilterValue) {
        const textFilterValues = splitString(simplifyString(textFilterValue))
        this.setState({textFilterValues})
    }

    getFilteredProjects() {
        const {projects} = this.props
        const {textFilterValues} = this.state
        const searchMatchers = textFilterValues.map(filter => RegExp(filter, 'i'))
        return searchMatchers.length
            ? projects.filter(project =>
                _.every(searchMatchers, matcher =>
                    matcher.test(simplifyString(project.name))
                )
            )
            : projects
    }

    getHighlightMatcher() {
        const {textFilterValues} = this.state
        return getHighlightMatcher(textFilterValues)
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
