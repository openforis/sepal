import {getLogger} from '#sepal/log'

import {migrate} from './migration/engine.js'
import {currentVersionForType, MIGRATIONS_BY_TYPE} from './migration/registry.js'
import * as repository from './recipeRepository.js'

const log = getLogger('migrateRecipes')

const migrateRecipes = async () => {
    for (const type of Object.keys(MIGRATIONS_BY_TYPE)) {
        const version = currentVersionForType(type)
        const rows = await repository.listRecipesOfTypeBeforeVersion(type, version)
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.contents)
                const {contents, typeVersion} = migrate(parsed, row.type_version, MIGRATIONS_BY_TYPE[type])
                await repository.saveMigratedRecipe({
                    id: row.id, username: row.username, typeVersion, contents: JSON.stringify(contents)
                })
                log.info(`Migrated recipe ${row.id} (${type}) to version ${typeVersion}`)
            } catch (error) {
                log.warn(`Failed to migrate recipe ${row.id} (${type})`, error)
            }
        }
    }
}

export {migrateRecipes}
