import {setApi} from '~/apiRegistry'

import apps from './api/apps'
import ceoGateway from './api/ceo'
import gee from './api/gee'
import google from './api/google'
import map from './api/map'
import planet from './api/planet'
import project from './api/project'
import recipe from './api/recipe'
import tasks from './api/tasks'
import user from './api/user'
import userAssets from './api/userAssets'
import userFiles from './api/userFiles'
import wmts from './api/wmts'

export const initApi = () =>
    setApi({
        apps,
        gee,
        google,
        map,
        planet,
        project,
        recipe,
        tasks,
        user,
        userAssets,
        userFiles,
        wmts,
        ceoGateway
    })
