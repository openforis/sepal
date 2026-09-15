import {tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

export const updateProject$ = project =>
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
            error: error => {
                const code = error.response?.code
                if (code === 'PROJECT_CYCLE') {
                    Notifications.error({message: msg('process.project.update.cycle'), error})
                } else if (code === 'PROJECT_PARENT_NOT_FOUND') {
                    Notifications.error({message: msg('process.project.update.parentNotFound'), error})
                } else {
                    Notifications.error({message: msg('process.project.update.error'), error})
                }
            }
        })
