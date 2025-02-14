import {STree} from '~/tree/sTree'

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
            ), true
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
            true
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
                value => ({...value, removing: true})
            )
        )
    )

const updateItem = (tree, path, items) =>
    STree.alter(tree, tree => {
        const node = STree.traverse(tree, path)
        STree.updateValue(node, ({loading: _loading, ...value}) => value)
        Object.entries(items).forEach(([key, value]) => {
            STree.updateValue(
                STree.traverse(tree, [...path, key], true),
                prevValue => ({...prevValue, ...value})
            )
        })
        Object.keys(STree.getChildNodes(node)).forEach(key => {
            if (!Object.keys(items).includes(key)) {
                STree.removeChildNode(node, key)
            }
        })
    })

const getSelectedItems = tree =>
    STree.reduce(tree, ({directories, files}, {value: {dir, selected} = {}, path}) => {
        return selected
            ? dir
                ? ({directories: [...directories, path], files})
                : ({directories, files: [...files, path]})
            : ({directories, files})
    }, {directories: [], files: []})

const getOpenDirectories = (tree, basePath) =>
    STree.reduce(STree.traverse(tree, basePath), (directories, {value: {dir, opened} = {}, path}) => {
        return dir && opened
            ? [...directories, path]
            : directories
    }, [])

const toStringPath = STree.toStringPath

const fromStringPath = STree.fromStringPath

const getPath = STree.getPath

const getDepth = STree.getDepth

const getChildNodes = STree.getChildNodes

const getMTime = node =>
    STree.getValue(node)?.mtime

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
    setRemoving, updateItem, getSelectedItems, getOpenDirectories, toStringPath, fromStringPath, getPath, getDepth,
    getChildNodes, getMTime, isDirectory, isSelected, isOpened, isLoading, isAdding, isRemoving
}
