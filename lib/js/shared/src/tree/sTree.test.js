import assert from 'node:assert/strict'
import {it} from 'node:test'

import {NODE, STree} from './sTree.js'

it('create root with no value', () => {
    const tree = STree.createRoot()
    assert.deepEqual(tree, {
        ...NODE,
        path: []
    })
})

it('root is root', () => {
    const tree = STree.createRoot()
    assert.deepEqual(STree.isRoot(tree), true)
})

it('node is not root', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    assert.deepEqual(STree.isRoot(foo), false)
})

it('create root with value', () => {
    const tree = STree.createRoot({foo: 'bar'})
    assert.deepEqual(tree, {
        ...NODE,
        path: [],
        value: {
            foo: 'bar'
        }
    })
})

it('create one node under root', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        items: {
            foo: {
                ...NODE,
                path: ['foo']
            }
        }
    })
})

it('create one node with value under root', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo', 'bar')
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 'bar'
            }
        }
    })
})

it('create two nodes under root', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.addChildNode(root, 'bar', 'baz')
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        items: {
            foo: {
                ...NODE,
                path: ['foo']
            },
            bar: {
                ...NODE,
                path: ['bar'],
                value: 'baz'
            }
        }
    })
})

it('get child nodes', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.addChildNode(root, 'bar')
    assert.deepEqual(STree.getChildNodes(root), {
        foo: {
            ...NODE,
            path: ['foo']
        },
        bar: {
            ...NODE,
            path: ['bar']
        }
    })
})

it('get leaf child node', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.addChildNode(root, 'bar')
    const foo = STree.getChildNode(root, 'foo')
    assert.deepEqual(foo, {
        ...NODE,
        path: ['foo']
    })
})

it('get non-leaf child node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    STree.addChildNode(foo, 'bar')
    assert.deepEqual(STree.getChildNode(root, 'foo'), {
        ...NODE,
        path: ['foo'],
        items: {
            bar: {
                ...NODE,
                path: ['foo', 'bar']
            }
        }
    })
})

it('is not leaf node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    STree.addChildNode(foo, 'bar')
    assert.deepEqual(STree.isLeaf(foo), false)
})

it('is leaf node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    assert.deepEqual(STree.isLeaf(bar), true)
})

it('remove child node from leaf node (impossible)', () => {
    const root = STree.createRoot()
    STree.removeChildNode(root, 'foo')
    assert.deepEqual(root, {
        ...NODE,
        path: []
    })
})

it('remove child node', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.addChildNode(root, 'bar')
    STree.removeChildNode(root, 'foo')
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        items: {
            bar: {
                ...NODE,
                path: ['bar']
            }
        }
    })
})

it('remove last child node', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.removeChildNode(root, 'foo')
    assert.deepEqual(root, {
        ...NODE,
        path: []
    })
})

it('remove non-existing child node', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.addChildNode(root, 'bar')
    STree.removeChildNode(root, 'baz')
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        items: {
            foo: {
                ...NODE,
                path: ['foo']
            },
            bar: {
                ...NODE,
                path: ['bar']
            }
        }
    })
})

it('string path to array path - no path', () => {
    assert.throws(() => STree.fromStringPath())
})

it('string path to array path - root', () => {
    assert.deepEqual(STree.fromStringPath(''), [])
})

it('string path to array path - first level path', () => {
    assert.deepEqual(STree.fromStringPath('foo'), ['foo'])
})

it('string path to array path - second level path', () => {
    assert.deepEqual(STree.fromStringPath('foo/bar'), ['foo', 'bar'])
})

it('string path to array path - leading slash', () => {
    assert.deepEqual(STree.fromStringPath('/foo/bar'), ['foo', 'bar'])
})

it('string path to array path - multiple slashes', () => {
    assert.deepEqual(STree.fromStringPath('foo//bar'), ['foo', 'bar'])
})

it('string path to array path - ending slash', () => {
    assert.deepEqual(STree.fromStringPath('foo/bar/'), ['foo', 'bar'])
})

it('string path to array path - multiple slashes', () => {
    assert.deepEqual(STree.fromStringPath('/foo///bar//baz/'), ['foo', 'bar', 'baz'])
})

it('array path to string path - no path', () => {
    assert.deepEqual(STree.toStringPath([]), '')
})

it('array path to string path - root', () => {
    assert.deepEqual(STree.toStringPath([]), '')
})

it('array path to string path - first level path', () => {
    assert.deepEqual(STree.toStringPath(['foo']), 'foo')
})

it('array path to string path - second level path', () => {
    assert.deepEqual(STree.toStringPath(['foo', 'bar']), 'foo/bar')
})

it('array path to string path - empty leading segment', () => {
    assert.deepEqual(STree.toStringPath(['', 'foo', 'bar']), 'foo/bar')
})

it('array path to string path - empty intermediate segment', () => {
    assert.deepEqual(STree.toStringPath(['foo', '', 'bar']), 'foo/bar')
})

it('array path to string path - empty ending segment', () => {
    assert.deepEqual(STree.toStringPath(['foo', 'bar', '']), 'foo/bar')
})

it('get path', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    assert.deepEqual(STree.getPath(bar), ['foo', 'bar'])
})

it('get key for root', () => {
    const root = STree.createRoot()
    assert.deepEqual(STree.getKey(root), undefined)
})

it('get key for node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    assert.deepEqual(STree.getKey(bar), 'bar')
})

it('get depth for root', () => {
    const root = STree.createRoot()
    assert.deepEqual(STree.getDepth(root), 0)
})

it('get depth for node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    assert.deepEqual(STree.getDepth(bar), 2)
})

it('set value', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    STree.setValue(foo, 'bar')
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 'bar'
            }
        }
    })
})

it('get value', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo', 'bar')
    assert.deepEqual(STree.getValue(foo), 'bar')
})

it('update value', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.updateValue(foo, value => value + 1)
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 2
            }
        }
    })
})

it('traverse tree (existing path)', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    STree.addChildNode(bar, 'baz')
    const baz = STree.traverse(root, ['foo', 'bar', 'baz'])
    assert.deepEqual(baz, {
        ...NODE,
        path: ['foo', 'bar', 'baz']
    })
})

it('traverse tree (non-existing path)', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    STree.addChildNode(bar, 'baz')
    const baz = STree.traverse(root, ['foo', 'bar', 'qux'])
    assert.deepEqual(baz, undefined)
})

it('traverse tree (non-existing path, one missing node, create=true)', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    STree.addChildNode(bar, 'baz')
    const boo = STree.traverse(root, ['foo', 'bar', 'boo'], true)
    assert.deepEqual(boo, {
        ...NODE,
        path: ['foo', 'bar', 'boo']
    })
})

it('traverse tree, (non-existing path, two missing nodes, create=true)', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    const baz = STree.traverse(root, ['foo', 'bar', 'baz'], true)
    assert.deepEqual(baz, {
        ...NODE,
        path: ['foo', 'bar', 'baz']
    })
})

for (const key of ['constructor', 'toString', '__proto__']) {
    it(`get missing child node named ${key}`, () => {
        const root = STree.createRoot()
        STree.addChildNode(root, 'foo')
        assert.equal(STree.getChildNode(root, key), undefined)
    })

    it(`traverse tree creating a node named ${key}`, () => {
        const root = STree.createRoot()
        const node = STree.traverse(root, [key, 'foo'], true)
        assert.deepEqual(node, {
            ...NODE,
            path: [key, 'foo']
        })
        assert.deepEqual(Object.keys(STree.getChildNodes(root)), [key])
    })
}

it('traverse reduce', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseReduce(root, ['foo', 'bar'], (acc, {value}) => acc + (value || 0), 0)
    assert.deepEqual(baz, 6)
})

it('traverse find existing', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseFind(root, ['foo', 'bar'], ({value}) => value === 2)
    assert.deepEqual(baz, foo)
})

it('traverse find missing', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseFind(root, ['foo', 'bar'], ({value}) => value === 0)
    assert.deepEqual(baz, undefined)
})

it('traverse find out-of-scope', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseFind(root, ['foo', 'bar'], ({value}) => value === 4)
    assert.deepEqual(baz, undefined)
})

it('clone node', () => {
    const node = STree.createNode(['foo', 'bar'], 123)
    assert.deepEqual(STree.cloneNode(node), {
        ...NODE,
        path: ['foo', 'bar'],
        value: 123
    })
})

it('clone root', () => {
    const root = STree.createRoot(1)
    assert.deepEqual(STree.clone(root), {
        ...NODE,
        path: [],
        value: 1
    })
})

it('clone tree', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    assert.deepEqual(STree.clone(root), {
        ...NODE,
        path: [],
        value: 1,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 2,
                items: {
                    bar: {
                        ...NODE,
                        path: ['foo', 'bar'],
                        value: 4,
                        items: {
                            baz: {
                                ...NODE,
                                path: ['foo', 'bar', 'baz'],
                                value: 5
                            }
                        }
                    }
                }
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 3
            }
        }
    })
})

it('clone, filter everything', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    assert.deepEqual(STree.clone(root, () => false), {
        ...NODE,
        path: [],
        value: 1
    })
})

it('clone, filter leaf ', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    assert.deepEqual(STree.clone(root, node => STree.getValue(node) < 5), {
        ...NODE,
        path: [],
        value: 1,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 2,
                items: {
                    bar: {
                        ...NODE,
                        path: ['foo', 'bar'],
                        value: 4
                    }
                }
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 3
            }
        }
    })
})

it('clone, filter leaf and parent', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    assert.deepEqual(STree.clone(root, node => STree.getValue(node) < 4), {
        ...NODE,
        path: [],
        value: 1,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 2
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 3
            }
        }
    })
})

it('clone, filter leaf and two parents', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    assert.deepEqual(STree.clone(root, node => STree.getValue(node) === 3), {
        ...NODE,
        path: [],
        value: 1,
        items: {
            qux: {
                ...NODE,
                path: ['qux'],
                value: 3
            }
        }
    })
})

it('scan tree', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    STree.scan(root, node => STree.updateValue(node, value => value * 10))
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        value: 10,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 20,
                items: {
                    bar: {
                        ...NODE,
                        path: ['foo', 'bar'],
                        value: 40,
                        items: {
                            baz: {
                                ...NODE,
                                path: ['foo', 'bar', 'baz'],
                                value: 50
                            }
                        }
                    }
                }
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 30
            }
        }
    })
})

it('scan subtree', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    STree.scan(foo, node => STree.updateValue(node, value => value * 10))
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        value: 1,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 20,
                items: {
                    bar: {
                        ...NODE,
                        path: ['foo', 'bar'],
                        value: 40,
                        items: {
                            baz: {
                                ...NODE,
                                path: ['foo', 'bar', 'baz'],
                                value: 50
                            }
                        }
                    }
                }
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 3
            }
        }
    })
})

it('scan tree with min depth', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    STree.scan(root, node => STree.updateValue(node, value => value * 10), {minDepth: 2})
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        value: 1,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 2,
                items: {
                    bar: {
                        ...NODE,
                        path: ['foo', 'bar'],
                        value: 40,
                        items: {
                            baz: {
                                ...NODE,
                                path: ['foo', 'bar', 'baz'],
                                value: 50
                            }
                        }
                    }
                }
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 3
            }
        }
    })
})

it('scan with max depth', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    STree.scan(root, node => STree.updateValue(node, value => value * 10), {maxDepth: 1})
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        value: 10,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 20,
                items: {
                    bar: {
                        ...NODE,
                        path: ['foo', 'bar'],
                        value: 4,
                        items: {
                            baz: {
                                ...NODE,
                                path: ['foo', 'bar', 'baz'],
                                value: 5
                            }
                        }
                    }
                }
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 30
            }
        }
    })
})

it('scan tree with min and max depth', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    STree.addChildNode(root, 'qux', 3)
    const bar = STree.addChildNode(foo, 'bar', 4)
    STree.addChildNode(bar, 'baz', 5)
    STree.scan(root, node => STree.updateValue(node, value => value * 10), {minDepth: 1, maxDepth: 2})
    assert.deepEqual(root, {
        ...NODE,
        path: [],
        value: 1,
        items: {
            foo: {
                ...NODE,
                path: ['foo'],
                value: 20,
                items: {
                    bar: {
                        ...NODE,
                        path: ['foo', 'bar'],
                        value: 40,
                        items: {
                            baz: {
                                ...NODE,
                                path: ['foo', 'bar', 'baz'],
                                value: 5
                            }
                        }
                    }
                }
            },
            qux: {
                ...NODE,
                path: ['qux'],
                value: 30
            }
        }
    })
})

it('reduce', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    assert.deepEqual(STree.reduce(root, (acc, {value}) => acc + (value || 0), 0), 15)
})
 
it('find root', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    assert.deepEqual(STree.find(root, ({value}) => value === 1), root)
})

it('find first level', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    assert.deepEqual(STree.find(root, ({value}) => value === 3), bar)
})

it('find intermediate', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    assert.deepEqual(STree.find(root, ({value}) => value === 4), baz)
})

it('find breadth-first', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'qux', 4)
    const baz = STree.addChildNode(root, 'baz', 4)
    assert.deepEqual(STree.find(root, ({value}) => value === 4), baz)
})

it('find leave', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    const qux = STree.addChildNode(baz, 'qux', 5)
    assert.deepEqual(STree.find(root, ({value}) => value === 5), qux)
})

it('find missing', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    assert.deepEqual(STree.find(root, ({value}) => value === 6), undefined)
})

it('export as tree (default value and item wrappers)', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.addChildNode(foo, 'bar', 2)
    STree.addChildNode(root, 'baz', 3)
    assert.deepEqual(STree.toTree(root), {
        path: [],
        value: undefined,
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
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.addChildNode(foo, 'bar', 2)
    STree.addChildNode(root, 'baz', 3)
    const nodeMapper = ({path, value, items}) => ({p: path.join('/'), v: value, i: items})
    assert.deepEqual(STree.toTree(root, nodeMapper), {
        p: '',
        v: undefined,
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
    const foo = STree.addChildNode(root, 'foo', {a: 1})
    STree.addChildNode(foo, 'bar', {b: 2})
    STree.addChildNode(root, 'baz', {c: 3})
    const nodeMapper = ({path, value, items}) => ({p: path, d: path.length, ...value, ...items})
    assert.deepEqual(STree.toTree(root, nodeMapper), {
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
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.addChildNode(foo, 'bar', 2)
    STree.addChildNode(root, 'baz', 3)
    assert.deepEqual(STree.toArray(root), [{
        path: [],
        value: undefined,
        depth: 0
    }, {
        path: ['foo'],
        value: 1,
        depth: 1
    }, {
        path: ['foo', 'bar'],
        value: 2,
        depth: 2
    }, {
        path: ['baz'],
        value: 3,
        depth: 1
    }])
})

it('export as array with node mapper', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    STree.addChildNode(foo, 'bar')
    STree.addChildNode(root, 'baz')
    assert.deepEqual(STree.toArray(root, ({path}) => ([path, path.length])), [
        [[], 0],
        [['foo'], 1],
        [['foo', 'bar'], 2],
        [['baz'], 1]
    ])
})
