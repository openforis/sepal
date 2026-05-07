import {map, of, switchMap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {registerGuiAction as registerAction} from '~/app/home/body/chat/guiActionRegistry'
import {getLogger} from '~/log'
import {select} from '~/store'
import {uuid} from '~/uuid'

import {loadProjects$} from '../recipe'
import {respondError} from './response'

const log = getLogger('chat-project-actions')

const ensureProjectsLoaded$ = () =>
    select('process.projects') ? of(null) : loadProjects$()

const createProject = ({name, defaultAssetFolder, defaultWorkspaceFolder, respond}) => {
    const id = uuid()
    const project = {id, name}
    if (defaultAssetFolder) project.defaultAssetFolder = defaultAssetFolder
    if (defaultWorkspaceFolder) project.defaultWorkspaceFolder = defaultWorkspaceFolder
    api.project.save$(project).subscribe({
        next: () => {
            const projects = select('process.projects') || []
            const next = projects.find(p => p.id === id) ? projects : [...projects, project]
            actionBuilder('CHAT_CREATE_PROJECT', {id})
                .set('process.projects', next)
                .dispatch()
            respond({success: true, data: project})
        },
        error: error => respondError({log, respond, fallback: 'Failed to create project', error})
    })
}

const listProjects = ({respond}) => {
    ensureProjectsLoaded$().subscribe({
        next: () => respond({success: true, data: select('process.projects') || []}),
        error: error => respondError({log, respond, fallback: 'Failed to list projects', error})
    })
}

const deleteProject = ({projectId, respond}) => {
    api.project.remove$(projectId).pipe(
        switchMap(projects =>
            api.recipe.loadAll$().pipe(
                map(recipes => ({projects, recipes}))
            )
        )
    ).subscribe({
        next: ({projects, recipes}) => {
            actionBuilder('CHAT_DELETE_PROJECT', {projectId})
                .set('process.projects', projects)
                .set('process.recipes', recipes)
                .dispatch()
            respond({success: true, data: {deleted: projectId}})
        },
        error: error => respondError({log, respond, fallback: 'Failed to delete project', error})
    })
}

export const registerProjectActions = () => {
    registerAction('create-project', createProject)
    registerAction('list-projects', listProjects)
    registerAction('delete-project', deleteProject)
}
