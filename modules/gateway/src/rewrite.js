import {parse} from 'url'

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
    // An empty subLocation still carries the location's trailing slash: path + '/' and path are
    // different URLs to the browser (relative references resolve against the parent otherwise).
    const relativeLocation = subLocation
        ? (subLocation.startsWith('/') ? subLocation : `/${subLocation}`)
        : (locationUrl.pathname.endsWith('/') ? '/' : '')
    return path + relativeLocation
}

export {rewriteLocation}
