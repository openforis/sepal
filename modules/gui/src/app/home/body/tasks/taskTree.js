import {STree} from '#sepal/tree/sTree'

// TaskTree — sTree wrapper for the worker's task subscription payloads, mirroring
// fileTree.js updateItem semantics: merge the listing's items at path, prune children
// absent from the listing. Tasks form a flat list for now (all children of the root),
// but the path-based wire format keeps room for nesting later.

const create = () =>
    STree.createRoot()

const fromStringPath = STree.fromStringPath

const updateItem = (tree, path, items) =>
    STree.alter(tree, tree => {
        const node = STree.traverse(tree, path, true)
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

const toTasks = tree =>
    Object.values(STree.getChildNodes(tree))
        .map(node => STree.getValue(node))
        .sort(({creationTime: a = ''}, {creationTime: b = ''}) => a.localeCompare(b))

export const TaskTree = {
    create, fromStringPath, updateItem, toTasks
}
