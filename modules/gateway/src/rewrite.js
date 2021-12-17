const {parse} = require('url')

const rewriteLocation = ({path, target, location}) => {
    const targetUrl = parse(target)
    const locationUrl = parse(location)
    if (locationUrl.host && locationUrl.host !== targetUrl.host) {
        return location
    }
    const locationIndex = locationUrl.pathname.startsWith(targetUrl.pathname)
        ? targetUrl.pathname.length
        : 0
    const subLocation = locationUrl.pathname.substring(locationIndex)
    const relativeLocation = (!subLocation || subLocation.startsWith('/') ? subLocation : `/${subLocation}`)
    return path + relativeLocation
}

module.exports = {rewriteLocation}
