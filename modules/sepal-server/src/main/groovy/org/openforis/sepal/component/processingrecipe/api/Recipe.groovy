package org.openforis.sepal.component.processingrecipe.api

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.transform.Immutable

@Immutable
class Recipe {
    String id
    int typeVersion
    String projectId
    String name
    String type
    String username
    private String contents
    Date creationTime
    Date updateTime

    def getParsedContents() {
        contents == null ? null : new JsonSlurper().parseText(contents)
    }

    String getContents() {
        def parsed = getParsedContents()
        parsed.typeVersion = typeVersion
        parsed.projectId = projectId
        parsed.name = name
        return new JsonOutput().toJson(parsed)
    }

    void setContents(contents) {
        this.contents = contents
    }

    Recipe created(Date date) {
        new Recipe(id: id, projectId: projectId, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: date, updateTime: date)
    }

    Recipe updated(Date date) {
        new Recipe(id: id, projectId: projectId, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: creationTime, updateTime: date)
    }

    Recipe withTypeVersion(int typeVersion) {
        new Recipe(id: id, projectId: projectId, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: creationTime, updateTime: updateTime)
    }

    Recipe withContents(String contents) {
        new Recipe(id: id, projectId: projectId, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: creationTime, updateTime: updateTime)
    }

    String toString() {
        return "Recipe(id: ${id}, projectId: ${projectId}, username: ${username}, type: ${type}, name: ${name})"
    }
}
