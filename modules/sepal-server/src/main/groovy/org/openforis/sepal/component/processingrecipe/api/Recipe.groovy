package org.openforis.sepal.component.processingrecipe.api

import groovy.json.JsonSlurper
import groovy.transform.Immutable

@Immutable
class Recipe {
    String id
    int typeVersion
    String name
    String type
    String username
    String contents
    Date creationTime
    Date updateTime

    def getParsedContents() {
        contents == null ? null : new JsonSlurper().parseText(contents)
    }

    Recipe created(Date date) {
        new Recipe(id: id, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: date, updateTime: date)
    }

    Recipe updated(Date date) {
        new Recipe(id: id, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: creationTime, updateTime: date)
    }

    Recipe withTypeVersion(int typeVersion) {
        new Recipe(id: id, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: creationTime, updateTime: updateTime)
    }

    Recipe withContents(String contents) {
        new Recipe(id: id, name: name, type: type, typeVersion: typeVersion, username: username, contents: contents, creationTime: creationTime, updateTime: updateTime)
    }

    String toString() {
        return "Recipe(id: ${id}, username: ${username}, type: ${type}, name: ${name})"
    }
}
