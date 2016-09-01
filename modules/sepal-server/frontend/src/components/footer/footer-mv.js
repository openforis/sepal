/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './footer-v' )

var onAppLoad = function () {
    View.init()
    View.show()
    
    showLogo()
}

var showLogo = function () {
    setTimeout( View.showLogo, 1000 )
}

EventBus.addEventListener( Events.APP.LOAD, onAppLoad )
// EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, showLogo )

EventBus.addEventListener( Events.SECTION.SHOW, View.show )
EventBus.addEventListener( Events.SECTION.REDUCE, View.hide )
