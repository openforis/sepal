import {ROOT_NODE, STree, TREE_NODE} from './sTree'

it('create root with no value', () => {
    const tree = STree.createRoot()
    expect(tree).toEqual(ROOT_NODE)
})

it('root is root', () => {
    const tree = STree.createRoot()
    expect(STree.isRoot(tree)).toEqual(true)
})

it('node is not root', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    expect(STree.isRoot(foo)).toEqual(false)
})

it('create root with value', () => {
    const tree = STree.createRoot({foo: 'bar'})
    expect(tree).toEqual({
        ...ROOT_NODE,
        value: {
            foo: 'bar'
        }
    })
})

it('create one node under root', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    expect(root).toEqual({
        ...ROOT_NODE,
        items: {
            foo: {
                ...TREE_NODE,
                path: ['foo']
            }
        }
    })
})

it('create one node with value under root', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo', 'bar')
    expect(root).toEqual({
        ...ROOT_NODE,
        items: {
            foo: {
                ...TREE_NODE,
                path: ['foo'],
                value: 'bar'
            }
        }
    })
})

it('create two nodes under root', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    STree.createChildNode(root, 'bar', 'baz')
    expect(root).toEqual({
        ...ROOT_NODE,
        items: {
            foo: {
                ...TREE_NODE,
                path: ['foo']
            },
            bar: {
                ...TREE_NODE,
                path: ['bar'],
                value: 'baz'
            }
        }
    })
})

it('get child nodes', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    STree.createChildNode(root, 'bar')
    expect(STree.getChildNodes(root)).toEqual({
        foo: {
            ...TREE_NODE,
            path: ['foo']
        },
        bar: {
            ...TREE_NODE,
            path: ['bar']
        }
    })
})

it('get leaf child node', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    STree.createChildNode(root, 'bar')
    const foo = STree.getChildNode(root, 'foo')
    expect(foo).toEqual({
        ...TREE_NODE,
        path: ['foo']
    })
})

it('get non-leaf child node', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    STree.createChildNode(foo, 'bar')
    expect(STree.getChildNode(root, 'foo')).toEqual({
        ...TREE_NODE,
        path: ['foo'],
        items: {
            bar: {
                ...TREE_NODE,
                path: ['foo', 'bar']
            }
        }
    })
})

it('is not leaf node', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    STree.createChildNode(foo, 'bar')
    expect(STree.isLeaf(foo)).toEqual(false)
})

it('is leaf node', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    const bar = STree.createChildNode(foo, 'bar')
    expect(STree.isLeaf(bar)).toEqual(true)
})

it('remove child node from leaf node (impossible)', () => {
    const root = STree.createRoot()
    STree.removeChildNode(root, 'foo')
    expect(root).toEqual({
        ...ROOT_NODE,
        path: []
    })
})

it('remove child node', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    STree.createChildNode(root, 'bar')
    STree.removeChildNode(root, 'foo')
    expect(root).toEqual({
        ...ROOT_NODE,
        path: [],
        items: {
            bar: {
                ...TREE_NODE,
                path: ['bar']
            }
        }
    })
})

it('remove last child node', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    STree.removeChildNode(root, 'foo')
    expect(root).toEqual({
        ...ROOT_NODE,
        path: []
    })
})

it('remove non-existing child node', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    STree.createChildNode(root, 'bar')
    STree.removeChildNode(root, 'baz')
    expect(root).toEqual({
        ...ROOT_NODE,
        path: [],
        items: {
            foo: {
                ...TREE_NODE,
                path: ['foo']
            },
            bar: {
                ...TREE_NODE,
                path: ['bar']
            }
        }
    })
})

it('string path to array path - no path', () => {
    expect(() => STree.fromStringPath('')).toThrow()
})

it('string path to array path - relative path', () => {
    expect(() => STree.fromStringPath('foo')).toThrow()
})

it('string path to array path - root', () => {
    expect(STree.fromStringPath('/')).toEqual([])
})

it('string path to array path - first level path', () => {
    expect(STree.fromStringPath('/foo')).toEqual(['foo'])
})

it('string path to array path - second level path', () => {
    expect(STree.fromStringPath('/foo/bar')).toEqual(['foo', 'bar'])
})

it('array path to string path - no path', () => {
    expect(STree.toStringPath([])).toEqual('/')
})

it('array path to string path - root', () => {
    expect(STree.toStringPath([])).toEqual('/')
})

it('array path to string path - first level path', () => {
    expect(STree.toStringPath(['foo'])).toEqual('/foo')
})

it('array path to string path - second level path', () => {
    expect(STree.toStringPath(['foo', 'bar'])).toEqual('/foo/bar')
})

it('get path', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    const bar = STree.createChildNode(foo, 'bar')
    expect(STree.getPath(bar)).toEqual(['foo', 'bar'])
})

it('set value', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    STree.setValue(foo, 'bar')
    expect(root).toEqual({
        ...ROOT_NODE,
        path: [],
        items: {
            foo: {
                ...TREE_NODE,
                path: ['foo'],
                value: 'bar'
            }
        }
    })
})

it('get value', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo', 'bar')
    expect(STree.getValue(foo)).toEqual('bar')
})

it('update value', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo', 1)
    STree.updateValue(foo, value => value + 1)
    expect(root).toEqual({
        ...ROOT_NODE,
        path: [],
        items: {
            foo: {
                ...TREE_NODE,
                path: ['foo'],
                value: 2
            }
        }
    })
})

it('traverse tree of existing nodes', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    const bar = STree.createChildNode(foo, 'bar')
    STree.createChildNode(bar, 'baz')
    const baz = STree.traverse(root, ['foo', 'bar', 'baz'])
    expect(baz).toEqual({
        ...TREE_NODE,
        path: ['foo', 'bar', 'baz']
    })
})

it('traverse tree, create one missing node', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    const bar = STree.createChildNode(foo, 'bar')
    STree.createChildNode(bar, 'baz')
    const boo = STree.traverse(root, ['foo', 'bar', 'boo'], true)
    expect(boo).toEqual({
        ...TREE_NODE,
        path: ['foo', 'bar', 'boo']
    })
})

it('traverse tree, create two missing nodes', () => {
    const root = STree.createRoot()
    STree.createChildNode(root, 'foo')
    const baz = STree.traverse(root, ['foo', 'bar', 'baz'], true)
    expect(baz).toEqual({
        ...TREE_NODE,
        path: ['foo', 'bar', 'baz']
    })
})

it('traverse reduce', () => {
    const root = STree.createRoot(1)
    const foo = STree.createChildNode(root, 'foo', 2)
    const bar = STree.createChildNode(foo, 'bar', 3)
    STree.createChildNode(bar, 'baz', 4)
    const baz = STree.traverseReduce(root, ['foo', 'bar'], (acc, value) => acc + (value || 0), 0)
    expect(baz).toEqual(6)
})

it('traverse find', () => {
    const root = STree.createRoot(1)
    const foo = STree.createChildNode(root, 'foo', 2)
    const bar = STree.createChildNode(foo, 'bar', 3)
    STree.createChildNode(bar, 'baz', 4)
    const baz = STree.traverseFind(root, ['foo', 'bar'], value => value === 2)
    expect(baz).toEqual(foo)
})

it('scan descendants', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo', 1)
    STree.createChildNode(root, 'qux', 2)
    const bar = STree.createChildNode(foo, 'bar', 3)
    STree.createChildNode(bar, 'baz', 4)
    STree.scan(foo, node => STree.updateValue(node, value => value * 10))
    expect(root).toEqual({
        ...ROOT_NODE,
        path: [],
        items: {
            foo: {
                ...TREE_NODE,
                path: ['foo'],
                value: 1,
                items: {
                    bar: {
                        ...TREE_NODE,
                        path: ['foo', 'bar'],
                        value: 30,
                        items: {
                            baz: {
                                ...TREE_NODE,
                                path: ['foo', 'bar', 'baz'],
                                value: 40
                            }
                        }
                    }
                }
            },
            qux: {
                ...TREE_NODE,
                path: ['qux'],
                value: 2
            }
        }
    })
})

it('reduce', () => {
    const root = STree.createRoot(1)
    STree.createChildNode(root, 'foo', 2)
    const bar = STree.createChildNode(root, 'bar', 3)
    const baz = STree.createChildNode(bar, 'baz', 4)
    STree.createChildNode(baz, 'qux', 5)
    expect(STree.reduce(root, (acc, value) => acc + (value || 0), 0)).toEqual(15)
})

it('find root', () => {
    const root = STree.createRoot(1)
    STree.createChildNode(root, 'foo', 2)
    const bar = STree.createChildNode(root, 'bar', 3)
    const baz = STree.createChildNode(bar, 'baz', 4)
    STree.createChildNode(baz, 'qux', 5)
    expect(STree.find(root, value => value === 1)).toEqual(root)
})

it('find first level', () => {
    const root = STree.createRoot(1)
    STree.createChildNode(root, 'foo', 2)
    const bar = STree.createChildNode(root, 'bar', 3)
    const baz = STree.createChildNode(bar, 'baz', 4)
    STree.createChildNode(baz, 'qux', 5)
    expect(STree.find(root, value => value === 3)).toEqual(bar)
})

it('find intermediate', () => {
    const root = STree.createRoot(1)
    STree.createChildNode(root, 'foo', 2)
    const bar = STree.createChildNode(root, 'bar', 3)
    const baz = STree.createChildNode(bar, 'baz', 4)
    STree.createChildNode(baz, 'qux', 5)
    expect(STree.find(root, value => value === 4)).toEqual(baz)
})

it('find leave', () => {
    const root = STree.createRoot(1)
    STree.createChildNode(root, 'foo', 2)
    const bar = STree.createChildNode(root, 'bar', 3)
    const baz = STree.createChildNode(bar, 'baz', 4)
    const qux = STree.createChildNode(baz, 'qux', 5)
    expect(STree.find(root, value => value === 5)).toEqual(qux)
})

it('export as tree (default value and item wrappers)', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo', 1)
    STree.createChildNode(foo, 'bar', 2)
    STree.createChildNode(root, 'baz', 3)
    expect(STree.toTree(root)).toEqual({
        path: [],
        items: {
            foo: {
                path: ['foo'],
                value: 1,
                items: {
                    bar: {
                        path: ['foo', 'bar'],
                        value: 2,
                        items: {}
                    }
                }
            },
            baz: {
                path: ['baz'],
                value: 3,
                items: {}
            },
        }
    })
})

it('export as tree with node mapper (no depth, wrapped path, value and items)', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo', 1)
    STree.createChildNode(foo, 'bar', 2)
    STree.createChildNode(root, 'baz', 3)
    const nodeMapper = ({path, value, items}) => ({p: path.join('/'), v: value, i: items})
    expect(STree.toTree(root, nodeMapper)).toEqual({
        p: '',
        i: {
            foo: {
                p: 'foo',
                v: 1,
                i: {
                    bar: {
                        p: 'foo/bar',
                        v: 2,
                        i: {}
                    }
                }
            },
            baz: {
                p: 'baz',
                v: 3,
                i: {}
            }
        }
    })
})

it('export as tree with node mapper (wrapped path and depth, inline value and items)', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo', {a: 1})
    STree.createChildNode(foo, 'bar', {b: 2})
    STree.createChildNode(root, 'baz', {c: 3})
    const nodeMapper = ({path, value, items}) => ({p: path, d: path.length, ...value, ...items})
    expect(STree.toTree(root, nodeMapper)).toEqual({
        p: [],
        d: 0,
        foo: {
            p: ['foo'],
            d: 1,
            a: 1,
            bar: {
                p: ['foo', 'bar'],
                d: 2,
                b: 2
            }
        },
        baz: {
            p: ['baz'],
            d: 1,
            c: 3
        }
    })
})

it('export as array', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo', 1)
    STree.createChildNode(foo, 'bar', 2)
    STree.createChildNode(root, 'baz', 3)
    expect(STree.toArray(root)).toEqual([{
        path: []
    }, {
        path: ['foo'],
        value: 1,
    }, {
        path: ['foo', 'bar'],
        value: 2
    }, {
        path: ['baz'],
        value: 3
    }])
})

it('export as array with node mapper', () => {
    const root = STree.createRoot()
    const foo = STree.createChildNode(root, 'foo')
    STree.createChildNode(foo, 'bar')
    STree.createChildNode(root, 'baz')
    expect(STree.toArray(root, ({path}) => ([path, path.length]))).toEqual([
        [[], 0],
        [['foo'], 1],
        [['foo', 'bar'], 2],
        [['baz'], 1]
    ])
})
