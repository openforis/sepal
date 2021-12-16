const {Subject} = require('rxjs')
const {notifyFrom, notifyTo} = require('./config')

const email$ = new Subject()

const notify = ({subject, content}) => email$.next({from: notifyFrom, to: notifyTo, subject, content})

module.exports = {email$, notify}
