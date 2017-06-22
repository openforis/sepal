package component.processingrecipe

class RemoveRecipeTest extends RecipeTest {
    def 'When removing recipe, it not in recipe list'() {
        def recipe = saveRecipe(newRecipe())

        when:
        removeRecipe(recipe.id)

        then:
        listRecipes(recipe.username).empty
    }

    def 'When removing recipe, it cannot be loaded'() {
        def recipe = saveRecipe(newRecipe())

        when:
        removeRecipe(recipe.id)

        then:
        !getRecipeById(recipe.id)
    }
}
