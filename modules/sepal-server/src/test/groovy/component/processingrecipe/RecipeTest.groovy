package component.processingrecipe

import fake.Database
import fake.FakeClock
import org.openforis.sepal.component.processingrecipe.ProcessingRecipeComponent
import org.openforis.sepal.component.processingrecipe.api.Recipe
import org.openforis.sepal.component.processingrecipe.command.RemoveRecipe
import org.openforis.sepal.component.processingrecipe.command.SaveRecipe
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
    final component = new ProcessingRecipeComponent(
            connectionManager,
            eventDispatcher,
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
                type: Recipe.Type.MOSAIC,
                typeVersion: args.typeVersion ?: 1,
                username: args.username ?: testUsername,
                contents: args.containsKey('contents') ? args.contents : '"some-contents"',
                creationTime: clock.now(),
                updateTime: clock.now()
        )
    }
}
