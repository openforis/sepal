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
    Map clientDirTree
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
            indicatedAddedFiles: !!query.clientDirTree,
            clientDirTree: query.clientDirTree ?: [dir: true, count: 0, files: [:]]
        ).execute()
    }

    private class Context {
        UserDir userDir
        String path
        Map clientDirTree
        boolean indicatedAddedFiles

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
            if (clientDirTree?.containsKey('files')) {
                def files = [:]
                fileList
                    .findAll { isFileIncluded(it) }
                    .forEach { files[it.name] = fileProperties(it)}

                clientDirTree.files?.keySet()
                    .findAll {!userDir.exists("${path}/${it}")}
                    .forEach { files[it] = [removed: true] }
                result.files = files
            }
            def dirCount = fileList.count { it.directory}
            return result
        }
        
        Map fileProperties(UserFile file) {
            def result
            if (file.directory) {
                def count = userDir.list(file).size()
                if (clientDirTree.files)
                    result = new Context(
                            userDir: userDir, 
                            path: userDir.toUserDirPath(file),
                            indicatedAddedFiles: indicatedAddedFiles,
                            clientDirTree: clientDirTree.files[file.name]
                        ).execute()
                else 
                    result = [dir: true, count: count]
            } else
                result = fileMap(file)
            if (indicatedAddedFiles && !clientDirTree?.files?.get(file.name))
                result.added = true
            return result
        }

        Map fileMap(UserFile file) {
            [size: file.size, lastModified: DateTime.toDateTimeString(new Date(file.lastModified))]
        }

        boolean isFileIncluded(UserFile file) {
            if (!clientDirTree.files) // Include file when no clientDirTrees are specified 
                return true
            def fileDirTree = clientDirTree.files[file.name]
            if (!fileDirTree) // Include file with no clientDirTree specified
                return true
            if (file.directory) {
                def count = userDir.list(file).size()
                return fileDirTree.files || count != fileDirTree.count || !fileDirTree.dir // Include if files in dir doesn't match or it isn't a dir in the clientDirTree
            } else {
                def previouslyModified = fileDirTree.lastModified
                def lastModified = DateTime.toDateTimeString(new Date(file.lastModified))
                return previouslyModified < lastModified || fileDirTree.dir  // Include if modified or it's a dir in clientDirTree
            }
        }  
    }
}