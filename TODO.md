create project crud panel and widget for recipe list
introduce recipe path (project / name)
allow selection of recipes for move/remove
exclude recipes with "noImageOutput: true"
group by project button in recipe list (maybe)
recipe selection combo with "all projects" combo button for extending search
disable autocompletion on all input fields


API

recipe: add property "projectId"
w
expose process.projects: [{id: 1, name: 'Foo'}, {id: 2, name: 'Bar'}, {id: 3, name: 'Baz'}]

===================

List projects
GET /api/processing-recipes/project

Create/update project
POST /api/processing-recipes/project
{
    "id": "some-project-id",
    "name": "some project name",
    "username": "admin"
}

Delete project
DELETE /api/processing-recipes/project/{projectId}



Move recipes
POST /api/processing-recipes/project/{projectId}
["some-recipe-id"]

Delete recipes
DELETE /api/processing-recipes
["some-recipe-id"]
