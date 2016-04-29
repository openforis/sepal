// common modules
require( 'bootstrap' )
require( '../ajax/ajax' )

// application styles
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

// event bus
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

// loader
var Loader = require( '../loader/loader' )

// global app variables
var Sepal = require( './sepal' )

// functions
var userLogged = function ( e, user ) {
    Sepal.User = user

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
