import {STree} from '#sepal/tree/sTree'

const create = () =>
    STree.createRoot({dir: true, opened: true})

const expandDirectory = (tree, path) =>
    STree.alter(tree, tree =>
        STree.updateValue(
            STree.traverse(tree, path),
            (value = {}) => ({...value, opened: true, loading: true})
        )
    )
        
const collapseDirectory = (tree, path) =>
    STree.alter(tree, tree => {
        deselectDescendants(tree, path)
        STree.updateValue(
            STree.traverse(tree, path),
            ({opened: _opened, loading: _loading, ...value} = {}) => value
        )
    })

const collapseAllDirectories = tree =>
    STree.alter(tree, tree =>
        STree.scan(tree, node =>
            STree.updateValue(
                node,
                ({opened: _opened, loading: _loading, selected: _selected, ...value} = {}) => value
            ), {minDepth: 1}
        )
    )
    
const selectItem = (tree, path) =>
    STree.alter(tree, tree => {
        deselectDescendants(tree, path)
        deselectParents(tree, path)
        STree.updateValue(
            STree.traverse(tree, path),
            (value = {}) => ({...value, selected: true})
        )
    })
                
const deselectItem = (tree, path) =>
    STree.alter(tree, tree =>
        STree.updateValue(
            STree.traverse(tree, path),
            ({selected: _selected, ...value} = {}) => value
        )
    )
            
const deselectDescendants = (tree, path) =>
    STree.alter(tree, tree =>
        STree.scan(
            STree.traverse(tree, path),
            node => STree.updateValue(node, ({selected: _selected, ...value} = {}) => value),
            {minDepth: 1}
        )
    )
        
const deselectParents = (tree, path) =>
    STree.alter(tree, tree =>
        STree.traverse(tree, path, false, node =>
            STree.updateValue(node, ({selected: _selected, ...value} = {}) => value)
        )
    )
            
const setRemoving = (tree, paths) =>
    STree.alter(tree, tree =>
        paths.forEach(
            path => STree.updateValue(
                STree.traverse(tree, path),
                ({selected: _selected, ...value} = {}) =>
                    Object.keys(value).length
                        ? ({...value, removing: true})
                        : undefined
            )
        )
    )

const clearRemoving = (tree, paths) =>
    STree.alter(tree, tree =>
        paths.forEach(path => {
            const node = STree.traverse(tree, fromStringPath(path))
            node && STree.updateValue(node, ({removing: _removing, ...value} = {}) =>
                Object.keys(value).length ? value : undefined
            )
        })
    )

const updateItem = (tree, path, items) =>
    STree.alter(tree, tree => {
        const node = STree.traverse(tree, path)
        // A directory just removed from its parent can still report once before it stops being watched.
        if (!node) {
            return
        }
        STree.updateValue(
            node,
            ({loading: _loading, ...value} = {}) => Object.keys(value).length ? value : undefined
        )
        Object.entries(items).forEach(([key, value]) => {
            STree.updateValue(
                STree.traverse(tree, [...path, key], true),
                (prevValue = {}) => ({...prevValue, ...value})
            )
        })
        Object.keys(STree.getChildNodes(node)).forEach(key => {
            if (!Object.keys(items).includes(key)) {
                STree.removeChildNode(node, key)
            }
        })
    })

// Adds a directory known to exist, such as one just created, ahead of the next listing of its parent.
const addDirectory = (tree, path) =>
    STree.alter(tree, tree =>
        path.forEach((_key, index) =>
            STree.updateValue(
                STree.traverse(tree, path.slice(0, index + 1), true),
                (value = {}) => ({...value, dir: true})
            )
        )
    )

const getSelectedItems = tree =>
    STree.reduce(tree, ({directories, files}, {value: {dir, selected} = {}, path}) => {
        return selected
            ? dir
                ? ({directories: [...directories, path], files})
                : ({directories, files: [...files, path]})
            : ({directories, files})
    }, {directories: [], files: []})

// Open directories whose contents are on display: every ancestor is open too.
const getExpandedDirectories = node =>
    isOpened(node)
        ? [STree.getPath(node), ...Object.values(STree.getChildNodes(node)).flatMap(getExpandedDirectories)]
        : []

const getNode = (tree, path) =>
    STree.traverse(tree, path)

const toStringPath = STree.toStringPath

const fromStringPath = STree.fromStringPath

const getPath = STree.getPath

const getDepth = STree.getDepth

const getChildNodes = STree.getChildNodes

const getMTime = node =>
    STree.getValue(node)?.mtime

const getSize = node =>
    STree.getValue(node)?.size

const isDirectory = node =>
    STree.getValue(node)?.dir
    
const isSelected = node =>
    STree.getValue(node)?.selected
    
const isOpened = node =>
    STree.getValue(node)?.opened
    
const isLoading = node =>
    STree.getValue(node)?.loading
    
const isAdding = node =>
    STree.getValue(node)?.adding
    
const isRemoving = node =>
    STree.getValue(node)?.removing
    
export const FileTree = {
    create, expandDirectory, collapseDirectory, collapseAllDirectories, selectItem, deselectItem, deselectDescendants,
    setRemoving, clearRemoving, updateItem, addDirectory, getSelectedItems, getExpandedDirectories, getNode, toStringPath, fromStringPath, getPath,
    getDepth, getChildNodes, getMTime, getSize, isDirectory, isSelected, isOpened, isLoading, isAdding, isRemoving
}
