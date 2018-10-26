package org.openforis.sepal.component.files.query

import groovy.transform.Immutable
import org.openforis.sepal.component.files.api.UserFile
import org.openforis.sepal.component.files.internal.UserDir
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.DateTime

@Immutable
class QueryFiles implements Query<Map> {
    String path
    Map filter
    String username
}

class QueryFilesHandler implements QueryHandler<Map, QueryFiles> {
    private final File homeDir

    QueryFilesHandler(File homeDir) {
        this.homeDir = homeDir
    }

    Map execute(QueryFiles query) {
        def userDir = new UserDir(homeDir, query.username)
        return new Context(
            userDir: userDir,
            path: query.path, 
            filter: query.filter ?: [dir: true, count: 0, files: [:]]
        ).execute()
    }

    private class Context {
        UserDir userDir
        String path
        Map filter

        Map execute() {
            if (!userDir.exists(path))
                return [removed: true]
            def root = userDir.toUserFile(path)
            if (!root.directory)
                return fileMap(root)
            def fileList = userDir.list(path)
            def result = [
                dir: true, 
                count: fileList.size(),
            ]
            if (filter.containsKey('files')) {
                def files = [:]
                fileList
                    .findAll { isFileIncluded(it) }
                    .forEach { files[it.name] = fileProperties(it)}

                filter.files?.keySet()
                    .findAll { !userDir.exists(it) }
                    .forEach { files[it] = [removed: true] }
                result.files = files
            }
            def dirCount = fileList.count { it.directory}
            return result
        }
        
        Map fileProperties(UserFile file) {
            if (file.directory) {
                def count = userDir.list(file).size()
                if (filter.files)
                    return new Context(
                            userDir: userDir, 
                            path: userDir.toUserDirPath(file), 
                            filter: filter.files[file.name]
                        ).execute()
                else 
                    return [dir: true, count: count]
            } else
                return fileMap(file)
        }

        Map fileMap(UserFile file) {
            [size: file.size, lastModified: DateTime.toDateTimeString(new Date(file.lastModified))]
        }

        boolean isFileIncluded(UserFile file) {
            if (!filter.files) // Include file when no filters are specified 
                return true
            def fileFilter = filter.files[file.name]
            if (!fileFilter) // Include file with no filter specified
                return true
            if (file.directory) {
                def count = userDir.list(file).size()
                return count != fileFilter.count || !fileFilter.dir // Include if files in dir doesn't match or it isn't a dir in the filter
            } else {
                def previouslyModified = fileFilter.lastModified
                def lastModified = DateTime.toDateTimeString(new Date(file.lastModified))
                return previouslyModified < lastModified || fileFilter.dir  // Include if modified or it's a dir in filter
            }
        }  
    }
}