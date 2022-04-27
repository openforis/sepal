package component.processingrecipe

import fake.Database
import fake.FakeClock
import groovy.json.JsonSlurper
import groovy.transform.ToString
import org.openforis.sepal.component.processingrecipe.ProcessingRecipeComponent
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.command.*
import org.openforis.sepal.component.processingrecipe.migration.AbstractMigrations
import org.openforis.sepal.component.processingrecipe.migration.Migrations
import org.openforis.sepal.component.processingrecipe.query.*
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import spock.lang.Specification

import static groovy.json.JsonParserType.LAX

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

    void removeRecipe(String id, String username = testUsername) {
        component.submit(new RemoveRecipe(id: id, username: username))
    }

    void removeRecipes(List<String> ids, String username = testUsername) {
        component.submit(new RemoveRecipes(ids: ids, username: username))
    }

    Recipe getRecipeById(String id, String username = testUsername) {
        component.submit(new LoadRecipe(id: id, username: username))
    }

    List<Recipe> listRecipes(String username = testUsername) {
        component.submit(new ListRecipes(username: username))
    }

    void moveRecipes(String projectId, List<String> recipeIds, String username = testUsername) {
        component.submit(new MoveRecipes(projectId: projectId, recipeIds: recipeIds, username: username))
    }

    Recipe newRecipe(Map args = [:]) {
        def type = args.type ?: (args.contents ? new JsonSlurper(type: LAX).parseText(args.contents).type : 'MOSAIC')
        if (!type)
            type = 'MOSAIC'
        new Recipe(
            id: args.id ?: UUID.randomUUID().toString(),
            projectId: args.projectId ?: 'test-project-id',
            name: args.name ?: 'some-name',
            type: type,
            typeVersion: args.typeVersion ?: currentTypeVersion,
            username: args.username ?: testUsername,
            contents: args.containsKey('contents') ? args.contents : '"some-contents"',
            creationTime: clock.now(),
            updateTime: clock.now()
        )
    }

    List<Map> listProjects(String username = testUsername) {
        component.submit(new ListProjects(username: username))
    }

    Map saveProject(Map project) {
        component.submit(new SaveProject(project))
        return project
    }

    void removeProject(String id, String username = testUsername) {
        component.submit(new RemoveProject(id: id, username: username))
    }

    Map newProject(Map args = [:]) {
        [
            id: args.id ?: UUID.randomUUID().toString(),
            name: args.name ?: 'some-name',
            username: args.username ?: testUsername
        ]
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

@ToString
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

