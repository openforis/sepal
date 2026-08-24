import {requireAuth} from './currentUser.js'
import * as api from './recipeApi.js'

const routes = router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    // Project routes first so `/project` is not captured by `/:id`.
    .post('/project/:id', requireAuth, api.moveRecipes)
    .delete('/project/:id', requireAuth, api.removeProject)
    .post('/project', requireAuth, api.saveProject)
    .get('/project', requireAuth, api.listProjects)
    .post('/:id', requireAuth, api.saveRecipe)
    .delete('/:id', requireAuth, api.removeRecipe)
    .get('/:id', requireAuth, api.loadRecipe)
    .get('/', requireAuth, api.listRecipes)
    .delete('/', requireAuth, api.removeRecipes)

export {routes}
