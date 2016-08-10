/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var Sepal = function () {
    // this.User = null

    this.Section = {
        opened: false
    }
}

Sepal.prototype.isSectionOpened = function () {
    return this.Section.opened === true
}

Sepal.prototype.isSectionClosed = function () {
    return !this.Section.opened === true
}

var _instance = new Sepal()

var showAppSection   = function () {
    _instance.Section.opened = true
}
var reduceAppSection = function () {
    _instance.Section.opened = false
}

EventBus.addEventListener( Events.SECTION.SHOW, showAppSection )
EventBus.addEventListener( Events.SECTION.REDUCE, reduceAppSection )


module.exports = _instance