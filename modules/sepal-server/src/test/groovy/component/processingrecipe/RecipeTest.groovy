package component.processingrecipe

import fake.Database
import fake.FakeClock
import org.openforis.sepal.component.processingrecipe.ProcessingRecipeComponent
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.command.MigrateRecipes
import org.openforis.sepal.component.processingrecipe.command.RemoveRecipe
import org.openforis.sepal.component.processingrecipe.command.SaveRecipe
import org.openforis.sepal.component.processingrecipe.migration.AbstractMigrations
import org.openforis.sepal.component.processingrecipe.migration.Migrations
import org.openforis.sepal.component.processingrecipe.query.ListRecipes
import org.openforis.sepal.component.processingrecipe.query.LoadRecipe
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import spock.lang.Specification

abstract class RecipeTest extends Specification {
    final database = new Database(ProcessingRecipeComponent.SCHEMA)
    final eventDispatcher = new SynchronousEventDispatcher()
    final connectionManager = new SqlConnectionManager(database.dataSource)
    final clock = new FakeClock()
    final migrations = new DelegatingMigrations(new DummyMigrations([:]))
    final migrationsByRecipeType = [MOSAIC: migrations]
    final component = new ProcessingRecipeComponent(
        connectionManager,
        eventDispatcher,
        migrationsByRecipeType,
        clock)

    final testUsername = 'test-user'


    Recipe saveRecipe(Recipe recipe) {
        component.submit(new SaveRecipe(
            recipe: recipe
        ))
        return recipe
    }

    void removeRecipe(String id) {
        component.submit(new RemoveRecipe(id: id))
    }

    Recipe getRecipeById(String id) {
        component.submit(new LoadRecipe(id: id))
    }

    List<Recipe> listRecipes(String username = testUsername) {
        component.submit(new ListRecipes(username: username))
    }

    Recipe newRecipe(Map args = [:]) {
        new Recipe(
            id: args.id ?: UUID.randomUUID().toString(),
            name: args.name ?: 'some-name',
            type: args.type ?: 'MOSAIC',
            typeVersion: args.typeVersion ?: currentTypeVersion,
            username: args.username ?: testUsername,
            contents: args.containsKey('contents') ? args.contents : '"some-contents"',
            creationTime: clock.now(),
            updateTime: clock.now()
        )
    }

    int getCurrentTypeVersion() {
        migrations.currentVersion
    }

    void withMigrations(Map<Integer, Closure> migrations) {
        this.migrations.replace(new DummyMigrations(migrations))
    }

    void withMigrations(Migrations migrations) {
        this.migrations.replace(migrations)
    }

    void migrate() {
        component.submit(new MigrateRecipes(migrations: migrations))
    }
}

class DelegatingMigrations implements Migrations {
    @Delegate private Migrations migrations

    DelegatingMigrations(Migrations migrations) {
        this.migrations = migrations
    }

    void replace(Migrations migrations) {
        this.migrations = migrations
    }
}


class DummyMigrations extends AbstractMigrations {
    DummyMigrations(Map<Integer, Closure> migrationsByVersion) {
        super('MOSAIC')
        migrationsByVersion.each { addMigration(it.key, it.value) }
    }
}

