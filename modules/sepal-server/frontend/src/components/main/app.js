// common modules
// require( 'tether' )
require( 'bootstrap' )
require( '../ajax/ajax' )

// loader
var Loader = require( '../loader/loader' )

// application styles
require( '../theme/base.css' )
require( '../theme/button.css' )
require( '../theme/form.css' )
require( '../theme/color.css' )
require( '../animation/animation.css' )
require( '../theme/section.css' )

require( '../theme/footer.css' )

// jquery sepal plugins
require( '../jquery-sepal-plugins/jquery-sepal-plugins' )

// application components
require( '../user/user-mv' )

require( '../login/login' )
require( '../map/map' )
require( '../nav-menu/nav-menu' )

require( '../app-section/app-section' )
require( '../tasks/tasks-mv' )
require( '../users/users-mv' )

// event bus
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )


// functions
var userLoggedIn = function ( e, user ) {
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

var checkUser = function () {
    var params = {
        url      : '/api/user'
        , success: function ( response ) {
            EventBus.dispatch( Events.APP.USER_LOGGED_IN, null, response )
            EventBus.dispatch( Events.USER.USER_DETAILS_LOADED, null, response )
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

checkUser()

// event handlers
EventBus.addEventListener( Events.APP.USER_LOGGED_IN, userLoggedIn )
