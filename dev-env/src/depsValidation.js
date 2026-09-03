const getAdjacency = (deps, graph) =>
    Object.fromEntries(
        Object.entries(deps).map(([module, moduleDeps]) => [
            module,
            graph === 'run'
                ? (moduleDeps || {}).run || []
                : Object.keys((moduleDeps || {}).build || {})
        ])
    )

const canonicalize = nodes => {
    const start = nodes.indexOf([...nodes].sort()[0])
    return [...nodes.slice(start), ...nodes.slice(0, start)]
}

const findGraphCycles = (adjacency, graph) => {
    const cycles = new Map()
    const visited = new Set()

    const visit = (module, path) => {
        const index = path.indexOf(module)
        if (index >= 0) {
            const nodes = canonicalize(path.slice(index))
            cycles.set(nodes.join(' -> '), {graph, path: [...nodes, nodes[0]]})
            return
        }
        if (visited.has(module)) {
            return
        }
        visited.add(module)
        for (const dependency of adjacency[module] || []) {
            visit(dependency, [...path, module])
        }
    }

    Object.keys(adjacency).forEach(module => visit(module, []))

    return [...cycles.values()]
}

export const findDependencyCycles = deps =>
    ['run', 'build'].flatMap(graph =>
        findGraphCycles(getAdjacency(deps, graph), graph)
    )

export const describeCycle = ({graph, path}) =>
    `Circular ${graph} dependency: ${path.join(' -> ')}`
