package component.processingrecipe


import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.command.MigrateRecipes
import org.openforis.sepal.component.processingrecipe.migration.Migrations

class MigrateRecipesTest extends RecipeTest {
    def 'Given no migrations and no recipes, migration run without error'() {
        when:
        migrate()

        then:
        notThrown Exception
    }

    def 'Given a recipe and a single migration, migration is run'() {
        def recipe = saveRecipe(newRecipe())

        when:
        migrate(1: { [migrated: true] })

        then:
        def migrated = getRecipeById(recipe.id)
        migrated.typeVersion == 2
        migrated.parsedContents == [migrated: true]
    }

    def 'Given a migration and a recipe with newer version, migration is not run'() {
        def recipe = saveRecipe(newRecipe(typeVersion: 2))

        when:
        migrate(1: { [migrated: true] })

        then:
        def migrated = getRecipeById(recipe.id)
        migrated.typeVersion == 2
        migrated.contents == recipe.contents
    }

    def 'Given two migrations and a recipe, migration are applied in order'() {
        def recipe = saveRecipe(newRecipe(contents: '[]'))

        when:
        migrate(2: { it << 2 }, 1: { it << 1 })

        then:
        def migrated = getRecipeById(recipe.id)
        migrated.typeVersion == 3
        migrated.parsedContents == [1, 2]
    }

    private migrate(Map<Integer, Closure> migrationsByVersion = [:]) {
        component.submit(new MigrateRecipes(migrations: new DummyMigrations(migrationsByVersion)))
    }
}

class DummyMigrations extends Migrations {
    DummyMigrations(Map<Integer, Closure> migrationsByVersion) {
        super(Recipe.Type.MOSAIC)
        migrationsByVersion.each { addMigration(it.key, it.value) }
    }
}
