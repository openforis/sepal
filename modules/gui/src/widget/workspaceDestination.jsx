import PropTypes from 'prop-types'
import React from 'react'
import {catchError, debounceTime, forkJoin, map, of, Subject, switchMap} from 'rxjs'

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
    loading = false
    validationSequence = 0
    workspacePath$ = new Subject()

    state = {
        loading: false
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
                switchMap(({path, validationSequence}) =>
                    path
                        ? forkJoin({
                            files: api.userFiles.listFiles$(path, {includeHidden: true}).pipe(
                                catchError(error => {
                                    if (error.status === 404) {
                                        return of(null)
                                    }
                                    throw error
                                })
                            ),
                            conflictingTasks: api.tasks.listExisting$({
                                outputPath: path,
                                destination: 'SEPAL',
                                status: 'PENDING,ACTIVE'
                            })
                        }).pipe(
                            map(response => ({...response, validationSequence})),
                            catchError(error => of({error, validationSequence}))
                        )
                        : of({skip: true, validationSequence})
                )
            ).subscribe(
                response => {
                    const {validationSequence, skip, error} = response
                    if (!this.completeValidation(validationSequence)) {
                        return
                    }
                    if (skip) {
                        this.props.workspacePathInput.setInvalid(null)
                    } else if (error) {
                        this.onError(error)
                    } else {
                        this.onWorkspaceChecked(response)
                    }
                }
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

    onWorkspaceChecked({files, conflictingTasks}) {
        const {workspacePathInput} = this.props
        if (conflictingTasks?.length) {
            workspacePathInput.setInvalid(msg('widget.workspaceDestination.taskPending'))
        } else if (files && files.count > 0) {
            workspacePathInput.setInvalid(msg('widget.workspaceDestination.notEmpty'))
        } else {
            workspacePathInput.setInvalid(null)
        }
    }

    onError() {
        const {workspacePathInput} = this.props
        workspacePathInput.setInvalid(msg('widget.workspaceDestination.loadError'))
    }

    checkWorkspacePath(path) {
        this.workspacePath$.next({
            path,
            validationSequence: this.startValidation(path)
        })
    }

    startValidation(path) {
        const {workspacePathInput} = this.props
        this.validationSequence += 1
        workspacePathInput.setInvalid(null)
        this.setLoading(!!path)
        return this.validationSequence
    }

    completeValidation(validationSequence) {
        if (validationSequence !== this.validationSequence) {
            return false
        }
        this.setLoading(false)
        return true
    }

    setLoading(loading) {
        if (this.loading === loading) {
            return
        }
        this.loading = loading
        this.setState({loading})
        this.notifyValidityCheckChange(loading)
    }

    notifyValidityCheckChange(loading) {
        const {onValidityCheckChange} = this.props
        onValidityCheckChange && onValidityCheckChange(loading)
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
    tooltip: PropTypes.any,
    onValidityCheckChange: PropTypes.func
}
