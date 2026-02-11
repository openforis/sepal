const {STree, NODE} = require('./sTree')

it('create root with no value', () => {
    const tree = STree.createRoot()
    expect(tree).toEqual({
        ...NODE,
        path: []
    })
})

it('root is root', () => {
    const tree = STree.createRoot()
    expect(STree.isRoot(tree)).toEqual(true)
})

it('node is not root', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    expect(STree.isRoot(foo)).toEqual(false)
})

it('create root with value', () => {
    const tree = STree.createRoot({foo: 'bar'})
    expect(tree).toEqual({
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
    expect(root).toEqual({
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
    expect(root).toEqual({
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
    expect(root).toEqual({
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
    expect(STree.getChildNodes(root)).toEqual({
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
    expect(foo).toEqual({
        ...NODE,
        path: ['foo']
    })
})

it('get non-leaf child node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    STree.addChildNode(foo, 'bar')
    expect(STree.getChildNode(root, 'foo')).toEqual({
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
    expect(STree.isLeaf(foo)).toEqual(false)
})

it('is leaf node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    expect(STree.isLeaf(bar)).toEqual(true)
})

it('remove child node from leaf node (impossible)', () => {
    const root = STree.createRoot()
    STree.removeChildNode(root, 'foo')
    expect(root).toEqual({
        ...NODE,
        path: []
    })
})

it('remove child node', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.addChildNode(root, 'bar')
    STree.removeChildNode(root, 'foo')
    expect(root).toEqual({
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
    expect(root).toEqual({
        ...NODE,
        path: []
    })
})

it('remove non-existing child node', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    STree.addChildNode(root, 'bar')
    STree.removeChildNode(root, 'baz')
    expect(root).toEqual({
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
    expect(() => STree.fromStringPath()).toThrow()
})

it('string path to array path - absolute path', () => {
    expect(() => STree.fromStringPath('/foo')).toThrow()
})

it('string path to array path - root', () => {
    expect(STree.fromStringPath('')).toEqual([])
})

it('string path to array path - first level path', () => {
    expect(STree.fromStringPath('foo')).toEqual(['foo'])
})

it('string path to array path - second level path', () => {
    expect(STree.fromStringPath('foo/bar')).toEqual(['foo', 'bar'])
})

it('array path to string path - no path', () => {
    expect(STree.toStringPath([])).toEqual('')
})

it('array path to string path - root', () => {
    expect(STree.toStringPath([])).toEqual('')
})

it('array path to string path - first level path', () => {
    expect(STree.toStringPath(['foo'])).toEqual('foo')
})

it('array path to string path - second level path', () => {
    expect(STree.toStringPath(['foo', 'bar'])).toEqual('foo/bar')
})

it('get path', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    expect(STree.getPath(bar)).toEqual(['foo', 'bar'])
})

it('get key for root', () => {
    const root = STree.createRoot()
    expect(STree.getKey(root)).toEqual(undefined)
})

it('get key for node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    expect(STree.getKey(bar)).toEqual('bar')
})

it('get depth for root', () => {
    const root = STree.createRoot()
    expect(STree.getDepth(root)).toEqual(0)
})

it('get depth for node', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    expect(STree.getDepth(bar)).toEqual(2)
})

it('set value', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    STree.setValue(foo, 'bar')
    expect(root).toEqual({
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
    expect(STree.getValue(foo)).toEqual('bar')
})

it('update value', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.updateValue(foo, value => value + 1)
    expect(root).toEqual({
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
    expect(baz).toEqual({
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
    expect(baz).toEqual(undefined)
})

it('traverse tree (non-existing path, one missing node, create=true)', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo')
    const bar = STree.addChildNode(foo, 'bar')
    STree.addChildNode(bar, 'baz')
    const boo = STree.traverse(root, ['foo', 'bar', 'boo'], true)
    expect(boo).toEqual({
        ...NODE,
        path: ['foo', 'bar', 'boo']
    })
})

it('traverse tree, (non-existing path, two missing nodes, create=true)', () => {
    const root = STree.createRoot()
    STree.addChildNode(root, 'foo')
    const baz = STree.traverse(root, ['foo', 'bar', 'baz'], true)
    expect(baz).toEqual({
        ...NODE,
        path: ['foo', 'bar', 'baz']
    })
})

it('traverse reduce', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseReduce(root, ['foo', 'bar'], (acc, {value}) => acc + (value || 0), 0)
    expect(baz).toEqual(6)
})

it('traverse find existing', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseFind(root, ['foo', 'bar'], ({value}) => value === 2)
    expect(baz).toEqual(foo)
})

it('traverse find missing', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseFind(root, ['foo', 'bar'], ({value}) => value === 0)
    expect(baz).toEqual(undefined)
})

it('traverse find out-of-scope', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'baz', 4)
    const baz = STree.traverseFind(root, ['foo', 'bar'], ({value}) => value === 4)
    expect(baz).toEqual(undefined)
})

it('clone node', () => {
    const node = STree.createNode(['foo', 'bar'], 123)
    expect(STree.cloneNode(node)).toEqual({
        ...NODE,
        path: ['foo', 'bar'],
        value: 123
    })
})

it('clone root', () => {
    const root = STree.createRoot(1)
    expect(STree.clone(root)).toEqual({
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
    expect(STree.clone(root)).toEqual({
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
    expect(STree.clone(root, () => false)).toEqual({
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
    expect(STree.clone(root, node => STree.getValue(node) < 5)).toEqual({
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
    expect(STree.clone(root, node => STree.getValue(node) < 4)).toEqual({
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
    expect(STree.clone(root, node => STree.getValue(node) === 3)).toEqual({
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
    expect(root).toEqual({
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
    expect(root).toEqual({
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
    expect(root).toEqual({
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
    expect(root).toEqual({
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
    expect(root).toEqual({
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
    expect(STree.reduce(root, (acc, {value}) => acc + (value || 0), 0)).toEqual(15)
})
 
it('find root', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    expect(STree.find(root, ({value}) => value === 1)).toEqual(root)
})

it('find first level', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    expect(STree.find(root, ({value}) => value === 3)).toEqual(bar)
})

it('find intermediate', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    expect(STree.find(root, ({value}) => value === 4)).toEqual(baz)
})

it('find breadth-first', () => {
    const root = STree.createRoot(1)
    const foo = STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(foo, 'bar', 3)
    STree.addChildNode(bar, 'qux', 4)
    const baz = STree.addChildNode(root, 'baz', 4)
    expect(STree.find(root, ({value}) => value === 4)).toEqual(baz)
})

it('find leave', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    const qux = STree.addChildNode(baz, 'qux', 5)
    expect(STree.find(root, ({value}) => value === 5)).toEqual(qux)
})

it('find missing', () => {
    const root = STree.createRoot(1)
    STree.addChildNode(root, 'foo', 2)
    const bar = STree.addChildNode(root, 'bar', 3)
    const baz = STree.addChildNode(bar, 'baz', 4)
    STree.addChildNode(baz, 'qux', 5)
    expect(STree.find(root, ({value}) => value === 6)).toEqual(undefined)
})

it('export as tree (default value and item wrappers)', () => {
    const root = STree.createRoot()
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.addChildNode(foo, 'bar', 2)
    STree.addChildNode(root, 'baz', 3)
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
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.addChildNode(foo, 'bar', 2)
    STree.addChildNode(root, 'baz', 3)
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
    const foo = STree.addChildNode(root, 'foo', {a: 1})
    STree.addChildNode(foo, 'bar', {b: 2})
    STree.addChildNode(root, 'baz', {c: 3})
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
    const foo = STree.addChildNode(root, 'foo', 1)
    STree.addChildNode(foo, 'bar', 2)
    STree.addChildNode(root, 'baz', 3)
    expect(STree.toArray(root)).toEqual([{
        path: [],
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
    expect(STree.toArray(root, ({path}) => ([path, path.length]))).toEqual([
        [[], 0],
        [['foo'], 1],
        [['foo', 'bar'], 2],
        [['baz'], 1]
    ])
})
