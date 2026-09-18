import {tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

export const updateFolder$ = folder =>
    api.folder.save$(folder).pipe(
        tap(folders => {
            actionBuilder('UPDATE_FOLDER', {folder})
                .set('process.folders', folders)
                .dispatch()
        })
    )

export const updateFolder = folder =>
    updateFolder$(folder)
        .subscribe({
            error: error => {
                const code = error.response?.code
                if (code === 'FOLDER_CYCLE') {
                    Notifications.error({message: msg('process.folder.update.cycle'), error})
                } else if (code === 'FOLDER_PARENT_NOT_FOUND') {
                    Notifications.error({message: msg('process.folder.update.parentNotFound'), error})
                } else {
                    Notifications.error({message: msg('process.folder.update.error'), error})
                }
            }
        })
