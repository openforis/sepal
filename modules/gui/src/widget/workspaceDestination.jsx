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

import {withActivators} from './activation/activator'
import {Button} from './button'
import {WorkspaceDestinationBrowser} from './workspaceDestinationBrowser'

const DEBOUNCE_TIME_MS = 750

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects'),
    tasks: selectFrom(state, 'tasks')
})

const mapRecipeToProps = recipe => ({
    user: currentUser(),
    projectId: recipe.projectId,
    recipeName: recipe.title || recipe.placeholder
})

class _WorkspaceDestination extends React.Component {
    static defaultProps = {
        browse: true,
        destination: 'SEPAL'
    }

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
        this.onChange = this.onChange.bind(this)
        this.openWorkspaceBrowser = this.openWorkspaceBrowser.bind(this)
    }

    render() {
        const {browse} = this.props
        return (
            <React.Fragment>
                {this.renderWorkspaceInput()}
                {browse ? this.renderWorkspaceBrowser() : null}
            </React.Fragment>
        )
    }

    renderWorkspaceInput() {
        const {workspacePathInput, label, placeholder, autoFocus, browse} = this.props
        const {loading} = this.state
        return (
            <Form.Input
                input={workspacePathInput}
                label={label}
                placeholder={placeholder}
                autoFocus={autoFocus}
                busyMessage={loading && msg('widget.loading')}
                buttons={browse ? [this.renderWorkspaceBrowserButton()] : []}
            />
        )
    }

    renderWorkspaceBrowser() {
        return (
            <WorkspaceDestinationBrowser
                onChange={this.onChange}
            />
        )
    }

    renderWorkspaceBrowserButton() {
        return (
            <Button
                key='browse'
                chromeless
                shape='none'
                air='none'
                icon='folder-open'
                tooltip={msg('widget.workspaceDestination.browser.tooltip')}
                tabIndex={-1}
                onClick={this.openWorkspaceBrowser}
            />
        )
    }

    openWorkspaceBrowser() {
        const {workspacePathInput, activator: {activatables: {workspaceBrowser}}} = this.props
        workspaceBrowser.activate({path: workspacePathInput.value})
    }

    onChange(path) {
        const {workspacePathInput} = this.props
        workspacePathInput.set(path)
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
                    this.validate$(path).pipe(
                        map(response => ({...response, validationSequence}))
                    )
                )
            ).subscribe(
                response => {
                    const {validationSequence, skip, invalidPath, error} = response
                    if (!this.completeValidation(validationSequence)) {
                        return
                    }
                    if (skip) {
                        this.props.workspacePathInput.setInvalid(null)
                    } else if (invalidPath) {
                        this.props.workspacePathInput.setInvalid(invalidPath)
                    } else if (error) {
                        this.onError(error)
                    } else {
                        this.onWorkspaceChecked(response)
                    }
                }
            )
        )
    }

    validate$(path) {
        if (!path) {
            return of({skip: true})
        }
        const invalidPath = this.invalidPath(path)
        if (invalidPath) {
            return of({invalidPath})
        }
        return forkJoin({
            files: this.listFiles$(path).pipe(
                catchError(error => {
                    if (error.status === 404) {
                        return of(null)
                    }
                    throw error
                })
            ),
            conflictingTasks: of(this.findConflictingTasks(path))
        }).pipe(
            catchError(error => of({error}))
        )
    }

    invalidPath(path) {
        const {destination} = this.props
        if (destination === 'SEPAL' && isInHomeDataFolder(path)) {
            return msg('widget.workspaceDestination.dataReserved')
        }
        if (destination === 'DATA' && !isSafeDataFolder(path)) {
            return msg('widget.workspaceDestination.invalidDataFolder')
        }
        return null
    }

    listFiles$(path) {
        const {listFiles$} = this.props
        return listFiles$
            ? listFiles$(path)
            : api.userFiles.listFiles$(path, {includeHidden: true})
    }

    // Data is not the home: what is remembered as the project's workspace folder does not apply there.
    defaultWorkspacePath() {
        const {recipeName, destination} = this.props
        const project = this.findProject()
        if (destination === 'SEPAL' && project?.defaultWorkspaceFolder) {
            return `${project.defaultWorkspaceFolder}/${recipeName}`
        }
        const root = destination === 'DATA' ? 'exports' : 'downloads'
        return project
            ? `${root}/${toSafeString(project.name)}/${recipeName}`
            : `${root}/${recipeName}`
    }

    findProject() {
        const {projects, projectId} = this.props
        return projects.find(({id}) => id === projectId)
    }

    findConflictingTasks(path) {
        const {tasks, destination} = this.props
        return (tasks || []).filter(({status, taskInfo}) =>
            ['PENDING', 'ACTIVE'].includes(status)
                && taskInfo?.destination === destination
                && taskInfo?.outputPath === path
        )
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
        const {workspacePathInput, destination} = this.props
        workspacePathInput.setInvalid(destination === 'DATA'
            ? msg('widget.workspaceDestination.dataLoadError')
            : msg('widget.workspaceDestination.loadError'))
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
    withRecipe(mapRecipeToProps),
    withActivators('workspaceBrowser')
)

WorkspaceDestination.propTypes = {
    workspacePathInput: PropTypes.object.isRequired,
    browse: PropTypes.bool,
    destination: PropTypes.oneOf(['SEPAL', 'DATA']),
    label: PropTypes.any,
    listFiles$: PropTypes.func,
    placeholder: PropTypes.string,
    tooltip: PropTypes.any,
    onValidityCheckChange: PropTypes.func
}

// The home's data folder is Data, which only the Data destination exports to.
const isInHomeDataFolder = path =>
    normalizedSegments(path)[0] === 'data'

const normalizedSegments = path =>
    path.split('/').reduce((segments, segment) => {
        if (segment === '..') {
            return segments.slice(0, -1)
        }
        return segment && segment !== '.' ? [...segments, segment] : segments
    }, [])

// As Data's storage takes a folder: relative, slash-separated, every segment named.
const isSafeDataFolder = path =>
    !path.includes('\\')
        && !path.includes('\0')
        && path.split('/').every(segment => segment && segment !== '.' && segment !== '..')
