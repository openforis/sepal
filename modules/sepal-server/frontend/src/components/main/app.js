// common modules
require( 'bootstrap' )
require( '../ajax/ajax' )

// styles
require( '../theme/base.css' )
require( '../theme/button.css' )
require( '../theme/form.css' )
require( '../theme/color.css' )
require( '../animation/animation.css' )
require( '../theme/section.css' )

require( '../theme/footer.css' )

// application components
require( '../login/login' )
require( '../map/map' )
require( '../nav-menu/nav-menu' )

require( '../app-section/app-section' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var Loader = require( '../loader/loader' )

// global app variables
var User = null

// functions
var userLogged = function ( e, user ) {
    User = user

    Loader.show()

    loadApp()

}

var loadApp = function () {

    setTimeout( function () {

        EventBus.dispatch( Events.LOGIN.HIDE )
        EventBus.dispatch( Events.APP.LOAD )

        Loader.hide()

    }, 2000 )

}

// event handlers
EventBus.addEventListener( Events.USER.LOGGED, userLogged )


// exposed global app variables
module.exports = {
    User: User
}
