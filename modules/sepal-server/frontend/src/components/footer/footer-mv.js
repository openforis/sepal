/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './footer-v' )

var onAppLoad = function () {
    View.init()
    View.show()
}

var onAppShow = function () {
    View.show()
}

var onAppReduce = function () {
    View.hide()
}

var onNavMenuLoaded = function (  ) {
    View.showLogo()
}

EventBus.addEventListener( Events.APP.LOAD, onAppLoad )
EventBus.addEventListener( Events.SECTION.SHOW, onAppShow )
EventBus.addEventListener( Events.SECTION.REDUCE, onAppReduce )
EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, onNavMenuLoaded )