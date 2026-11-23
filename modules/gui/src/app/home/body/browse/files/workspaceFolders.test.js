import {FileTree} from '~/app/home/body/browse/files/fileTree'

import {destinationName, foldersToMonitor, joinPath, parentFolderPath, visibleFolders} from './workspaceFolders'

describe('workspace paths', () => {
    it('splits a destination into its parent folder and name', () => {
        expect(parentFolderPath('downloads/project/recipe')).toEqual(['downloads', 'project'])
        expect(destinationName('downloads/project/recipe')).toEqual('recipe')
    })

    it('ignores empty and current-directory segments', () => {
        expect(parentFolderPath('./downloads//recipe/')).toEqual(['downloads'])
    })

    it('places a destination directly in home when it has no folder', () => {
        expect(parentFolderPath('recipe')).toEqual([])
        expect(joinPath([], 'recipe')).toEqual('recipe')
    })

    it('moves a destination name into another folder', () => {
        expect(joinPath(['other', 'folder'], destinationName('downloads/recipe'))).toEqual('other/folder/recipe')
    })
})

describe('foldersToMonitor', () => {
    it('monitors home and every existing folder along the selected path', () => {
        const tree = folderTree({'': ['a'], 'a': ['b']})

        expect(foldersToMonitor({tree, selectedFolder: ['a', 'b']})).toEqual(['', 'a', 'a/b'])
    })

    it('stops at the first folder that does not exist', () => {
        const tree = folderTree({'': ['a'], 'a': []})

        expect(foldersToMonitor({tree, selectedFolder: ['a', 'b', 'c']})).toEqual(['', 'a'])
    })

    it('waits for a parent to be listed before monitoring its subfolder', () => {
        expect(foldersToMonitor({tree: FileTree.create(), selectedFolder: ['a']})).toEqual([''])
    })

    it('does not monitor a file in place of a folder', () => {
        const tree = FileTree.updateItem(FileTree.create(), [], {a: {file: true}})

        expect(foldersToMonitor({tree, selectedFolder: ['a']})).toEqual([''])
    })
})

describe('visibleFolders', () => {
    const tree = folderTree({
        '': ['downloads', 'scripts'],
        'downloads': ['mosaic', 'ccdc'],
        'downloads/mosaic': ['2024'],
        'scripts': ['python']
    })

    it('shows only top-level folders when nothing is selected', () => {
        expect(visibleFolders({tree, selectedFolder: []})).toEqual([
            ['downloads'],
            ['scripts']
        ])
    })

    it('expands the folders along the selected path', () => {
        expect(visibleFolders({tree, selectedFolder: ['downloads', 'mosaic']})).toEqual([
            ['downloads'],
            ['downloads', 'ccdc'],
            ['downloads', 'mosaic'],
            ['downloads', 'mosaic', '2024'],
            ['scripts']
        ])
    })

    it('stops expanding where the selected path leaves the known folders', () => {
        expect(visibleFolders({tree, selectedFolder: ['downloads', 'missing']})).toEqual([
            ['downloads'],
            ['downloads', 'ccdc'],
            ['downloads', 'mosaic'],
            ['scripts']
        ])
    })

    it('leaves out files and hidden folders', () => {
        const tree = FileTree.updateItem(FileTree.create(), [], {
            'scripts': {dir: true},
            '.cache': {dir: true},
            'notes.txt': {file: true, size: 10}
        })

        expect(visibleFolders({tree, selectedFolder: []})).toEqual([['scripts']])
    })

    it('keeps folders matching the filter and the ancestors leading to them', () => {
        expect(visibleFolders({tree, selectedFolder: ['downloads', 'mosaic'], filter: '2024'})).toEqual([
            ['downloads'],
            ['downloads', 'mosaic'],
            ['downloads', 'mosaic', '2024']
        ])
    })

    it('matches the filter case-insensitively', () => {
        expect(visibleFolders({tree, selectedFolder: [], filter: 'SCRIPT'})).toEqual([
            ['scripts']
        ])
    })
})

// Listings in parent-first order, as the folders are watched.
const folderTree = listings =>
    Object.entries(listings).reduce(
        (tree, [path, names]) => FileTree.updateItem(
            tree,
            FileTree.fromStringPath(path),
            Object.fromEntries(names.map(name => [name, {dir: true}]))
        ),
        FileTree.create()
    )
