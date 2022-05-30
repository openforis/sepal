package component.processingrecipe

class ListProjectsTest extends RecipeTest {
    def 'Saved projects can be listed'() {
        def project1 = saveProject(newProject())
        def project2 = saveProject(newProject())
        saveProject(newProject(username: 'anotherUser'))

        expect:
        listProjects(testUsername).toSet() == [project1, project2].toSet()
    }

    def 'Saved default folders are listed'() {
        def project = saveProject(newProject([defaultAssetFolder: 'default/asset/folder', defaultWorkspaceFolder: 'default/workspace/folder']))

        expect:
        listProjects(testUsername).toSet() == [project].toSet()
    }
}
