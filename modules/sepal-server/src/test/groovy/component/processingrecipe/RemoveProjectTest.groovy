package component.processingrecipe

class RemoveProjectTest extends RecipeTest {
    def 'When removing project, it not in project list'() {
        def project = saveProject(newProject())

        when:
        removeProject(project.id)

        then:
        listProjects().empty
    }

    def 'When removing project, associated recipes are removed'() {
        def project = saveProject(newProject())
        def recipe1 = saveRecipe(newRecipe(projectId: project.id))
        def recipe2 = saveRecipe(newRecipe(projectId: project.id))

        when:
        removeProject(project.id)

        then:
        listRecipes().empty
    }
}
