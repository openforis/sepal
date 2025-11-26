import PropTypes from 'prop-types'
import React from 'react'
import {catchError, debounceTime, EMPTY, map, Subject, switchMap, tap} from 'rxjs'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {toSafeString} from '~/string'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {currentUser} from '~/user'
import {Form} from '~/widget/form'

const DEBOUNCE_TIME_MS = 750

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects')
})

const mapRecipeToProps = recipe => ({
    user: currentUser(),
    projectId: recipe.projectId,
    recipeName: recipe.title || recipe.placeholder
})

class _WorkspaceDestination extends React.Component {
    workspacePath$ = new Subject()
    
    state = {
        currentType: undefined,
        loading: null
    }

    constructor(props) {
        super(props)
        this.onError = this.onError.bind(this)
        this.onWorkspaceChecked = this.onWorkspaceChecked.bind(this)
    }

    render() {
        const {workspacePathInput, label, placeholder, autoFocus} = this.props
        const {loading} = this.state
        return (
            <Form.Input
                input={workspacePathInput}
                label={label}
                placeholder={placeholder}
                autoFocus={autoFocus}
                busyMessage={loading && msg('widget.loading')}
            />
        )
    }

    componentDidMount() {
        const {workspacePathInput} = this.props
        this.loadWorkspaceContent()
        if (!workspacePathInput.value) {
            workspacePathInput.set(this.defaultWorkspacePath() || null)
        } else {
            this.checkWorkspacePath(workspacePathInput.value)
        }
    }

    componentDidUpdate(prevProps) {
        const {workspacePathInput} = this.props
        const {workspacePathInput: prevWorkspacePathInput} = prevProps
        if (workspacePathInput?.value !== prevWorkspacePathInput?.value) {
            this.checkWorkspacePath(workspacePathInput.value)
        }
    }

    loadWorkspaceContent() {
        const {addSubscription} = this.props
        addSubscription(
            this.workspacePath$.pipe(
                debounceTime(DEBOUNCE_TIME_MS),
                tap(() => {
                    this.setState({loading: true})
                }),
                switchMap(path =>
                    api.userFiles.listFiles$(path, {includeHidden: true}).pipe(
                        tap(() => {
                            this.setState({loading: null})
                        }),
                        catchError(error => {
                            this.setState({loading: null})
                            this.onError(error)
                            return EMPTY
                        }),
                        map(response => response)
                    )
                )
            ).subscribe(
                response => this.onWorkspaceChecked(response)
            )
        )
    }

    defaultWorkspacePath() {
        const {recipeName} = this.props
        const project = this.findProject()
        if (project?.defaultWorkspaceFolder) {
            return `${project?.defaultWorkspaceFolder}/${recipeName}`
        } else {
            if (project) {
                const projectDir = toSafeString(project?.name)
                return `downloads/${projectDir}/${recipeName}`
            } else {
                return `downloads/${recipeName}`
            }
        }
    }

    findProject() {
        const {projects, projectId} = this.props
        return projects.find(({id}) => id === projectId)
    }

    onWorkspaceChecked(response) {
        const {workspacePathInput} = this.props
        if (response && response.count > 0) {
            const hasPendingTask = response.files?.some(file => file.name === '.task_pending')
            if (hasPendingTask) {
                workspacePathInput.setInvalid(msg('widget.workspaceDestination.taskPending'))
            } else {
                workspacePathInput.setInvalid(msg('widget.workspaceDestination.notEmpty'))
            }
        } else {
            workspacePathInput.setInvalid(null)
        }
    }

    onError(error) {
        const {workspacePathInput} = this.props
        if (error.status === 404) {
            workspacePathInput.setInvalid(null)
        } else {
            workspacePathInput.setInvalid(msg('widget.workspaceDestination.loadError'))
        }
    }

    checkWorkspacePath(path) {
        if (path) {
            this.workspacePath$.next(path)
        }
    }
}

export const WorkspaceDestination = compose(
    _WorkspaceDestination,
    withSubscriptions(),
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps)
)

WorkspaceDestination.propTypes = {
    workspacePathInput: PropTypes.object.isRequired,
    label: PropTypes.any,
    placeholder: PropTypes.string,
    tooltip: PropTypes.any
}
