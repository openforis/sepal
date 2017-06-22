package org.openforis.sepal.component.processingrecipe

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.processingrecipe.adapter.JdbcRecipeRepository
import org.openforis.sepal.component.processingrecipe.command.RemoveRecipe
import org.openforis.sepal.component.processingrecipe.command.RemoveRecipeHandler
import org.openforis.sepal.component.processingrecipe.command.SaveRecipe
import org.openforis.sepal.component.processingrecipe.command.SaveRecipeHandler
import org.openforis.sepal.component.processingrecipe.endpoint.ProcessingRecipeEndpoint
import org.openforis.sepal.component.processingrecipe.query.ListRecipes
import org.openforis.sepal.component.processingrecipe.query.ListRecipesHandler
import org.openforis.sepal.component.processingrecipe.query.LoadRecipe
import org.openforis.sepal.component.processingrecipe.query.LoadRecipeHandler
import org.openforis.sepal.sql.DatabaseConfig
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager

class ProcessingRecipeComponent extends DataSourceBackedComponent implements EndpointRegistry {
    static final String SCHEMA = 'processing_recipe'

    static ProcessingRecipeComponent create() {
        def connectionManager = SqlConnectionManager.create(DatabaseConfig.fromPropertiesFile(SCHEMA))
        return new ProcessingRecipeComponent(
                connectionManager,
                new AsynchronousEventDispatcher())
    }

    ProcessingRecipeComponent(
            SqlConnectionManager connectionManager,
            HandlerRegistryEventDispatcher eventDispatcher
    ) {
        super(connectionManager, eventDispatcher)
        def repository = new JdbcRecipeRepository(connectionManager)

        command(SaveRecipe, new SaveRecipeHandler(repository))
        command(RemoveRecipe, new RemoveRecipeHandler(repository))

        query(LoadRecipe, new LoadRecipeHandler(repository))
        query(ListRecipes, new ListRecipesHandler(repository))

        // TODO: list, remove
    }

    void registerEndpointsWith(Controller controller) {
        new ProcessingRecipeEndpoint(this).registerWith(controller)
    }
}
