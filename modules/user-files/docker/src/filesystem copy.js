const {homeDir} = require('./config')
const path = require('path')
const {access, lstat, readdir} = require('fs/promises')

const userHomePath = username =>
    path.join(homeDir, username)

const loadFiles$ = ({query: {path, username}}, body) => {

}

const deleteFiles$ = ({body}) => {

}

module.exports = {
    loadFiles$, deleteFiles$
}

const QueryFiles = (path, clientDirTree, username) => {
    const userHome = userHomePath(username)
    return Context({
        userDir: userHome,
        path,
        indicatedAddedFiles: !!clientDirTree,
        clientDirTree: clientDirTree || {dir: true, count: 0, files: []}
    })
}

const exists = async path => {
    try {
        await access(path, constants.R_OK);
        return true
      } catch {
        return false
    }
}

const isDirectory = async path => {
    return await lstat(path).isDirectory()
}

const size = async path => {
    return await lstat(path).size
}

const Context = ({userDir, path, indicatedAddedFiles, clientDirTree}) => {

    const execute = async () => {
        if (!await exists(path)) {
            return {removed: true}
        }
        if (!await isDirectory(path)) {
            return fileMap(path)
        }
        const fileList = await readdir(path)
        const result = {
            dir: true,
            count: fileList.length
        }
        if (clientDirTree && clientDirTree.files) {
            const files = {}
            fileList
                .filter(file => isFileIncluded(file))
                .forEach(file => files[file] = fileProperties(file))
            result.files = files
        }
        return result
    }

    const filePropertries = file => {
        const result = {}
        if (isDirectory(file)) {
            
        }
    }

    const fileMap = file => {

    }

    const isFileIncluded = file => {

    }
}

const UserFile = path => {
    const exists = async () => {
        try {
            await access(path, constants.R_OK);
            return true
          } catch {
            return false
        }
    }

    const isDirectory = async () => {
        return await lstat(path).isDirectory()
    }

    const size = async () => {
        return await lstat(path).size
    }

    return {
        path,
        exists
    }
}