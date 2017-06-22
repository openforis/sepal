package component.processingrecipe

class SaveRecipeTest extends RecipeTest {
    def 'When saving, it can be loaded'() {
        def recipe = newRecipe()

        when:
        saveRecipe(recipe)

        then:
        getRecipeById(recipe.id) == recipe
    }
}
