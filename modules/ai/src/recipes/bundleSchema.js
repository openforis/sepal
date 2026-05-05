// Bundle a recipe's parameterSchema into a self-contained JSON Schema.
//
// The on-disk recipe schemas use cross-file $refs (e.g.
// "../shared/aoi.schema.json#/$defs/eeTable") to share definitions like AOI.
// These are unresolvable for an LLM consumer, which only sees what we send.
//
// bundleSchema(parameterSchema) returns a deep-cloned schema where every
// cross-file $ref has been pulled into the host's `$defs` and rewritten as a
// local `#/$defs/<name>` ref. Transitive local refs inside imported subtrees
// (e.g. eeTable's reference to countryTableId in the same foreign file) are
// imported too, so the bundled schema is fully closed under $ref resolution.
//
// Local $refs in the host schema are preserved unchanged.

const path = require('path')
const fs = require('fs')

const recipesDir = __dirname
const schemasById = {}
for (const dirent of fs.readdirSync(recipesDir, {withFileTypes: true, recursive: true})) {
    if (dirent.isFile() && dirent.name.endsWith('.schema.json')) {
        const filePath = path.join(dirent.parentPath || dirent.path, dirent.name)
        const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        if (schema.$id) {
            schemasById[schema.$id] = schema
        }
    }
}

const bundleCache = {}

const bundleSchema = parameterSchema => {
    if (!parameterSchema || !parameterSchema.$id) {
        return parameterSchema
    }
    const cacheKey = parameterSchema.$id
    if (bundleCache[cacheKey]) {
        return bundleCache[cacheKey]
    }

    const host$id = parameterSchema.$id
    const bundled = JSON.parse(JSON.stringify(parameterSchema))
    bundled.$defs = bundled.$defs || {}

    const importDef = (foreign$id, defName) => {
        if (bundled.$defs[defName] !== undefined) return
        const file = schemasById[foreign$id]
        const def = file && file.$defs && file.$defs[defName]
        if (!def) return
        const cloned = JSON.parse(JSON.stringify(def))
        bundled.$defs[defName] = cloned
        walk(cloned, foreign$id)
    }

    const walk = (node, currentHost$id) => {
        if (Array.isArray(node)) {
            for (const item of node) walk(item, currentHost$id)
            return
        }
        if (!node || typeof node !== 'object') return

        if (typeof node.$ref === 'string') {
            const [filePart, fragment] = node.$ref.split('#')
            const defMatch = fragment && fragment.match(/^\/\$defs\/(.+)$/)
            if (filePart) {
                const foreign$id = new URL(filePart, currentHost$id).toString()
                if (defMatch) {
                    importDef(foreign$id, defMatch[1])
                    node.$ref = `#/$defs/${defMatch[1]}`
                }
            } else if (currentHost$id !== host$id && defMatch) {
                importDef(currentHost$id, defMatch[1])
            }
            return
        }

        for (const value of Object.values(node)) walk(value, currentHost$id)
    }

    walk(bundled, host$id)
    bundleCache[cacheKey] = bundled
    return bundled
}

module.exports = {bundleSchema}
