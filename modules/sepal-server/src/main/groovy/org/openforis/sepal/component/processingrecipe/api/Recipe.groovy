package org.openforis.sepal.component.processingrecipe.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class Recipe {
    String id
    String name
    Type type
    String username
    String contents
    Date creationTime
    Date updateTime

    Recipe created(Date date) {
        new Recipe(id: id, name: name, type: type, username: username, contents: contents, creationTime: date, updateTime: date)
    }

    Recipe updated(Date date) {
        new Recipe(id: id, name: name, type: type, username: username, contents: contents, creationTime: creationTime, updateTime: date)
    }

    enum Type {
        MOSAIC, CLASSIFICATION, CHANGE_DETECTION, ASSET
    }
}
