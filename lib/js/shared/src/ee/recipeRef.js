// const ee = require('ee')
// const {of} = require('rxjs')
const imageFactory = require('sepal/ee/imageFactory')

// const asset = ({id}) => { // [TODO] ?
const asset = () => {
    const recipe = null // TODO: Load recipe from Sepal

    return imageFactory(recipe)
}

module.exports = asset
