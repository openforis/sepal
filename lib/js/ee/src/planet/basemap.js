module.exports = {
    processBasemapCollection: collection => {
        return collection
            .select(
                ['B', 'G', 'R', 'N'],
                ['blue', 'green', 'red', 'nir']
            )
    }
}
