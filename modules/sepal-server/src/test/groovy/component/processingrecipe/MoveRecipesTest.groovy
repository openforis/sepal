package component.processingrecipe

class MoveRecipesTest extends RecipeTest {
    def 'When moving a recipe, project id is updated'() {
        def recipe = saveRecipe(newRecipe())

        when:
        moveRecipes('some-project-id', [recipe.id])

        then:
        listProjects().empty
    }
}
