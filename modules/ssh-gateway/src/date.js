const moment = require('moment')

moment.relativeTimeThreshold('w', Number.MAX_SAFE_INTEGER)
moment.relativeTimeThreshold('M', null)
moment.locale('compact', {
    relativeTime: {
        future: '%s',
        past: '%s',
        s: '%ds',
        ss: '%ds',
        m: '%dm',
        mm: '%dm',
        h: '%dh',
        hh: '%dh',
        d: '%dd',
        dd: '%dd',
        w: '%dw',
        ww: '%dw',
        y: '%dy',
        yy: '%dy'
    }
})

const fromNow = date =>
    moment(date).fromNow(true)

module.exports = {fromNow}
