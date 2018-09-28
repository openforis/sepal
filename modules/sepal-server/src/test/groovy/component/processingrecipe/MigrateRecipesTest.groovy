package component.processingrecipe

class MigrateRecipesTest extends RecipeTest {
    def 'Given no migrations and no recipes, migration run without error'() {
        when:
        migrate()

        then:
        notThrown Exception
    }

    def 'Given a recipe and a single migration, migration is run'() {
        def recipe = saveRecipe(newRecipe())
        withMigrations(1: { [migrated: true] })

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        migrated.typeVersion == 2
        migrated.parsedContents == [migrated: true]
    }

    def 'Given a migration and a recipe with newer version, migration is not run'() {
        withMigrations(1: { [migrated: true] })
        def recipe = saveRecipe(newRecipe(typeVersion: currentTypeVersion))

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        migrated.typeVersion == currentTypeVersion
        migrated.contents == recipe.contents
    }

    def 'Given two migrations and a recipe, migration are applied in order'() {
        def recipe = saveRecipe(newRecipe(contents: '[]'))
        withMigrations(2: { it << 2 }, 1: { it << 1 })

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        migrated.typeVersion == 3
        migrated.parsedContents == [1, 2]
    }
}