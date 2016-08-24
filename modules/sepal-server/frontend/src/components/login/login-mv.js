/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './login-v' )
// var FooterV  = require( '../footer/footer-v' )

var show = function ( e, invitation ) {
    View.show( invitation )
    // FooterV.init()
    // FooterV.show()
}

var hide = function ( e ) {
    View.hide()
    // FooterV.hide( { delay: 0, duration: 100 } )
}

EventBus.addEventListener( Events.LOGIN.SHOW, show )
EventBus.addEventListener( Events.LOGIN.HIDE, hide )