import {STree} from '~/tree/sTree'

const createRoot = () =>
    STree.createRoot({dir: true, opened: true})

const expandDirectory = (tree, path) =>
    STree.updateValue(
        STree.traverse(tree, path),
        (value = {}) => ({...value, opened: true, loading: true})
    )
        
const collapseDirectory = (tree, path) =>
    STree.updateValue(
        STree.traverse(tree, path),
        ({opened: _opened, loading: _loading, ...value} = {}) => value
    )
        
const selectItem = (tree, path) =>
    STree.updateValue(
        STree.traverse(tree, path),
        (value = {}) => ({...value, selected: true})
    )
                
const deselectItem = (tree, path) =>
    STree.updateValue(
        STree.traverse(tree, path),
        ({selected: _selected, ...value} = {}) => value
    )
            
const deselectDescendants = (tree, path) =>
    STree.scan(
        STree.traverse(tree, path),
        node => STree.updateValue(node, ({selected: _selected, ...value} = {}) => value)
    )
        
const deselectHierarchy = (tree, path) => {
    STree.traverse(tree, path, false, node =>
        STree.updateValue(node, ({selected: _selected, ...value} = {}) => value)
    )
    STree.scan(STree.traverse(tree, path), node =>
        STree.updateValue(node, ({selected: _selected, ...value} = {}) => value)
    )
}

const setRemoving = (tree, paths) =>
    paths.forEach(
        path => STree.updateValue(
            STree.traverse(tree, path),
            value => ({...value, removing: true})
        )
    )

const updateItem = (tree, path, items) => {
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
}

const getSelectedItems = tree =>
    STree.reduce(tree, ({directories, files}, {dir, selected} = {}, path) => {
        return selected
            ? dir
                ? ({directories: [...directories, path], files})
                : ({directories, files: [...files, path]})
            : ({directories, files})
    }, {directories: [], files: []})

const getOpenDirectories = (tree, basePath) =>
    STree.reduce(STree.traverse(tree, basePath), (directories, {dir, opened} = {}, path) => {
        return dir && opened
            ? [...directories, path]
            : directories
    }, [])

const isDirectory = node =>
    STree.getValue(node).dir
    
const isSelected = node =>
    STree.getValue(node).selected
    
const isOpened = node =>
    STree.getValue(node).opened
    
const isLoading = node =>
    STree.getValue(node).loading
    
export const FileTree = {
    createRoot, expandDirectory, collapseDirectory, selectItem, deselectItem, deselectDescendants, deselectHierarchy,
    setRemoving, updateItem, getSelectedItems, getOpenDirectories, isDirectory, isSelected, isOpened, isLoading
}
