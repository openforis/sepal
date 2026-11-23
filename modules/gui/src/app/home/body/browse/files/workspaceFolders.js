import {FileTree} from '~/app/home/body/browse/files/fileTree'

export const toFolderPath = path =>
    (path || '').split('/').filter(segment => segment && segment !== '.')

export const parentFolderPath = path =>
    toFolderPath(path).slice(0, -1)

export const destinationName = path =>
    toFolderPath(path).at(-1) || ''

export const joinPath = (folderPath, name) =>
    FileTree.toStringPath([...folderPath, ...toFolderPath(name)])

// Home and the folders along the selected path, as far as each is known to exist:
// monitoring a missing folder fails on the server, which then stops watching it.
export const foldersToMonitor = ({tree, selectedFolder}) => {
    const folderPaths = selectedFolder.map((_segment, index) => selectedFolder.slice(0, index + 1))
    const firstUnknown = folderPaths.findIndex(folderPath => !isFolder(FileTree.getNode(tree, folderPath)))
    const known = firstUnknown === -1 ? folderPaths : folderPaths.slice(0, firstUnknown)
    return [[], ...known].map(FileTree.toStringPath)
}

// Folders along the selected path are expanded; everything else stays collapsed.
// A filter keeps matching folders and the ancestors needed to reach them.
export const visibleFolders = ({tree, selectedFolder, filter = ''}) => {
    const search = filter.toLowerCase()
    const visit = node =>
        subfolders(node).flatMap(subfolder => {
            const path = FileTree.getPath(subfolder)
            const descendants = isAncestorOrSelf(path, selectedFolder) ? visit(subfolder) : []
            return !search || path.at(-1).toLowerCase().includes(search) || descendants.length
                ? [path, ...descendants]
                : []
        })
    return visit(tree)
}

const subfolders = node =>
    Object.entries(FileTree.getChildNodes(node))
        .filter(([name, child]) => isFolder(child) && !name.startsWith('.'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, child]) => child)

const isFolder = node =>
    !!node && !!FileTree.isDirectory(node)

const isAncestorOrSelf = (path, folderPath) =>
    path.length <= folderPath.length && path.every((segment, index) => segment === folderPath[index])
