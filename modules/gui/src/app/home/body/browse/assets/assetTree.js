import {STree} from '~/tree/sTree'

const create = () =>
    STree.createRoot({type: 'Folder', opened: true})

const expandDirectory = (tree, path) =>
    STree.alter(tree, tree =>
        STree.updateValue(
            STree.traverse(tree, path),
            (value = {}) => ({...value, opened: true})
        )
    )
        
const collapseDirectory = (tree, path) =>
    STree.alter(tree, tree => {
        deselectDescendants(tree, path)
        STree.updateValue(
            STree.traverse(tree, path),
            ({opened: _opened, ...value} = {}) => value
        )
    })

const selectItem = (tree, path) =>
    STree.alter(tree, tree => {
        deselectDescendants(tree, path)
        deselectParents(tree, path)
        STree.updateValue(
            STree.traverse(tree, path),
            ({removing, ...value} = {}) => (removing ? {...value, removing: true} : {...value, selected: true})
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
        paths.forEach(path =>
            STree.scan(STree.traverse(tree, path), node =>
                STree.updateValue(
                    node,
                    ({selected: _selected, ...value}) => ({...value, removing: true})
                )
            )
        )
    )

const updateTree = (prevTree, updateTree) =>
    STree.alter(prevTree, tree => {
        STree.scan(updateTree, updateNode => {
            const node = STree.traverse(tree, STree.getPath(updateNode), true)
            const updateValue = STree.getValue(updateNode)
    
            STree.updateValue(
                node,
                ({unconfirmed: _unconfirmed, removing: _removing, ...prevValue} = {}) => ({...prevValue, ...updateValue})
            )

            if (STree.isRoot(updateTree) || updateNode === updateTree || !STree.isLeaf(updateNode)) {
                const updateChildNodesKeys = Object.keys(STree.getChildNodes(updateNode))
                Object.entries(STree.getChildNodes(node))
                    .filter(([key, childNode]) => !updateChildNodesKeys.includes(key) && !isUnconfirmed(childNode))
                    .forEach(([key]) => STree.removeChildNode(node, key))
            }
        })
    })

const createFolder = (tree, path) =>
    STree.alter(tree, tree => {
        const node = STree.traverse(tree, path.slice(0, -1))
        STree.updateValue(node, prevValue => ({...prevValue, opened: true}))
        STree.addChildNode(node, path.at(-1), {type: 'Folder', unconfirmed: true})
    })

const getSelectedItems = tree =>
    STree.reduce(tree, ({directories, files}, {value: {type, selected} = {}, path}) => {
        return selected
            ? type === 'Folder'
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

const isExistingPath = (tree, path) =>
    !!STree.traverse(tree, path)

const toStringPath = STree.toStringPath

const fromStringPath = STree.fromStringPath
    
const getPath = STree.getPath
    
const getDepth = STree.getDepth
    
const getChildNodes = STree.getChildNodes
    
const getType = node =>
    STree.getValue(node)?.type

const getUpdateTime = node =>
    STree.getValue(node)?.updateTime

const getQuota = node =>
    STree.getValue(node)?.quota

const isDirectory = node =>
    STree.getValue(node)?.type === 'Folder'
    
const isUnconfirmed = node =>
    STree.getValue(node)?.unconfirmed
    
const isSelected = node =>
    STree.getValue(node)?.selected
    
const isOpened = node =>
    STree.getValue(node)?.opened
    
const isAdding = node =>
    STree.getValue(node)?.adding
    
const isRemoving = node =>
    STree.getValue(node)?.removing

const toList = node =>
    STree.toArray(
        node,
        ({path, value, depth}) => ({id: AssetTree.toStringPath(path), path, ...value, depth})
    ).filter(({depth}) => depth > 0)
    
const filter = (tree, filter) =>
    STree.clone(tree, filter)

export const AssetTree = {
    create, expandDirectory, collapseDirectory, selectItem, deselectItem, deselectDescendants, setRemoving, updateTree, createFolder,
    getSelectedItems, getOpenDirectories, isExistingPath, toStringPath, fromStringPath, getPath, getDepth, getChildNodes, getType,
    getUpdateTime, getQuota, isDirectory, isUnconfirmed, isSelected, isOpened, isAdding, isRemoving, toList, filter
}
