import {migrate} from './migration/engine.js'
import {currentVersionForType, MIGRATIONS_BY_TYPE} from './migration/registry.js'

const migrateRecipes = async ({repository, log}) => {
    for (const type of Object.keys(MIGRATIONS_BY_TYPE)) {
        const version = currentVersionForType(type)
        const stored = await repository.findRecipesToMigrate(type, version)
        for (const {id, owner, typeVersion: fromVersion, content} of stored) {
            try {
                if (!content) {
                    throw new Error('Stored recipe cannot be read')
                }
                const migrated = migrate(content, fromVersion, MIGRATIONS_BY_TYPE[type])
                await repository.saveMigratedRecipe({
                    id, owner,
                    typeVersion: migrated.typeVersion,
                    content: migrated.contents
                })
                log.info(`Migrated recipe ${id} (${type}) to version ${migrated.typeVersion}`)
            } catch (error) {
                log.warn(`Failed to migrate recipe ${id} (${type})`, error)
            }
        }
    }
}

export {migrateRecipes}
