import logConfig from '#config/log.json' with {type: 'json'}
import {createTransactionRunner} from '#sepal/db/mysql'
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {port} from './config.js'
import {createRequireAuth} from './currentUser.js'
import {initializeDatabase} from './db.js'
import {migrateRecipes} from './migrateRecipes.js'
import {RecipeRepository} from './recipeRepository.js'
import {RecipeService} from './recipeService.js'
import {createRoutes} from './routes.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    const pool = await initializeDatabase()
    const repository = new RecipeRepository(createTransactionRunner(pool))
    const recipeService = new RecipeService(repository)
    const requireAuth = createRequireAuth({log: getLogger('currentUser')})

    await migrateRecipes({repository, log: getLogger('migrateRecipes')})
    await server.start({port, routes: createRoutes({recipeService, requireAuth})})
    log.info('Initialized')
}

main().catch(log.fatal)
