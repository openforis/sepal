// const log = require('@sepal/log')
const {job} = require('@sepal/job')
const eeAuth = require('@sepal/ee/auth')
const ImageFactory = require('@sepal/ee/imageFactory')

const worker$ = ({recipe, bands}) => {
    const {getMap$} = require('@sepal/ee/utils')
    const {getImage, getVisParams} = ImageFactory(recipe, bands)
    return getMap$(getImage(), getVisParams())
}

module.exports = job({
    jobName: 'EE Image preview',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})
