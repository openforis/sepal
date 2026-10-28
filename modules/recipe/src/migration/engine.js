const currentVersion = migrationsForType => {
    const keys = Object.keys(migrationsForType).map(Number)
    return keys.length ? Math.max(...keys) : 1
}

// A migration keyed `v` brings a recipe up to version `v`; it runs when the recipe's current version
// is below `v`. The highest key is therefore the current version. A falsey entry is a baseline
// marker — it declares a version without running anything (no migration necessary to reach it), so
// it's skipped in the fold.
const migrate = (parsedContents, fromVersion, migrationsForType) => {
    const contents = Object.keys(migrationsForType)
        .map(Number)
        .filter(version => version > fromVersion)
        .sort((a, b) => a - b)
        .reduce((acc, version) => {
            const migration = migrationsForType[version]
            return migration ? migration(acc) : acc
        }, parsedContents)
    return {contents, typeVersion: currentVersion(migrationsForType)}
}

export {currentVersion, migrate}
