const ee = require('sepal/ee')
const {of} = require('rxjs')

const asset = ({id}, _bands) => {
    return {
        getImage$() {
            return of(ee.Image(id))
        },
        getBands$() {
            return ee.getInfo$(ee.Image(id).bandNames(), 'asset band names')
        },
        getVisParams$() {
            return of({})
        },
        getGeometry$() {
            return of(
                ee.Image(id).geometry()
            )
        },
        getRoot() {
            var match = id.match(/^(projects\/.*?\/assets)\/.*/)
                || id.match(/^(users\/.*?)\/.*/)
            return match && match[1]
        },
        getFolders() {
            const root = this.getRoot()
            const match = id
                .slice(root.length)
                .match(/^(\/.*)\/.*/)
            const names = match
                ? match[1].split('/').filter(name => name)
                : []
            return names.reduce(
                (acc, name) => acc.length
                    ? [...acc, `${acc[acc.length - 1]}/${name}`]
                    : [`${root}/${name}`],
                []
            )
        }
    }
}

module.exports = asset
