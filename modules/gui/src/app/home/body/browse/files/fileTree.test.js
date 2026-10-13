import {describe, expect, it} from 'vitest'

import {withDataNode} from './dataPaths'
import {FileTree} from './fileTree'

describe('getExpandedDirectories', () => {
    it('lists home and the open directories on display', () => {
        const tree = FileTree.expandDirectory(withDirectories(['a', 'b']), ['a'])

        expect(FileTree.getExpandedDirectories(tree)).toEqual([[], ['a']])
    })

    it('leaves out open directories inside a collapsed one', () => {
        const opened = FileTree.expandDirectory(withDirectories(['a']), ['a'])
        const expanded = FileTree.expandDirectory(FileTree.updateItem(opened, ['a'], {b: {dir: true}}), ['a', 'b'])

        const tree = FileTree.collapseDirectory(expanded, ['a'])

        expect(FileTree.getExpandedDirectories(tree)).toEqual([[]])
    })
})

describe('updateItem', () => {
    it('ignores the listing of a directory no longer in its parent', () => {
        const tree = FileTree.updateItem(withDirectories(['a']), [], {})

        const updated = FileTree.updateItem(tree, ['a'], {b: {dir: true}})

        expect(FileTree.getNode(updated, ['a'])).toBeUndefined()
    })
})

describe('addDirectory', () => {
    it('adds a directory and any missing parents', () => {
        const tree = FileTree.addDirectory(withDirectories(['a']), ['a', 'b', 'c'])

        expect(['a', 'b', 'c'].map((_key, index) =>
            FileTree.isDirectory(FileTree.getNode(tree, ['a', 'b', 'c'].slice(0, index + 1)))
        )).toEqual([true, true, true])
    })

    it('keeps what is known about existing directories', () => {
        const tree = FileTree.updateItem(FileTree.create(), [], {a: {dir: true, mtime: 1}})

        const updated = FileTree.addDirectory(tree, ['a', 'b'])

        expect(FileTree.getMTime(FileTree.getNode(updated, ['a']))).toEqual(1)
    })
})

const withDirectories = names =>
    FileTree.updateItem(
        FileTree.create(),
        [],
        Object.fromEntries(names.map(name => [name, {dir: true}]))
    )

describe('updateItem with the Data folder', () => {
    it('keeps the Data folder after a home listing that lacks it', () => {
        const tree = FileTree.updateItem(FileTree.create(), [], withDataNode('', {a: {dir: true}}))

        const updated = FileTree.updateItem(tree, [], withDataNode('', {b: {dir: true}}))

        expect(Object.keys(FileTree.getChildNodes(FileTree.getNode(updated, [])))).toEqual(['data', 'b'])
    })
})
