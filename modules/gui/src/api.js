import {setApi} from '~/apiRegistry'

import appLauncher from './api/appLauncher'
import apps from './api/apps'
import budget from './api/budget'
import ceoGateway from './api/ceo'
import gee from './api/gee'
import google from './api/google'
import map from './api/map'
import message from './api/message'
import planet from './api/planet'
import project from './api/project'
import recipe from './api/recipe'
import sessions from './api/sessions'
import storage from './api/storage'
import tasks from './api/tasks'
import user from './api/user'
import userAssets from './api/userAssets'
import userFiles from './api/userFiles'
import wmts from './api/wmts'

export const initApi = () =>
    setApi({
        apps,
        budget,
        gee,
        google,
        map,
        message,
        planet,
        project,
        recipe,
        sessions,
        storage,
        tasks,
        user,
        userAssets,
        userFiles,
        wmts,
        ceoGateway,
        appLauncher,
    })
