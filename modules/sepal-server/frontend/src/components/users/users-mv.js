/**
 * @author Mino Togna
 */

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var View      = require( './users-v' )
var Model     = require( './users-m' )
var UserMV    = require( '../user/user-mv' )
var NavMenu   = require( '../nav-menu/nav-menu' )
var Animation = require( '../animation/animation' )


var searchString = null

var init = function () {
    if ( UserMV.getCurrentUser().isAdmin() ) {
        Animation.animateIn( NavMenu.btnUsers() )
        
    }
}

var onSectionShow = function ( e, target ) {
    if ( target === 'users' ) {
        View.init()
        // View.showList()
        loadUsers()
    }
}

var loadUsers = function () {
    var params = {
        url      : '/api/users'
        , success: function ( response ) {
            Model.setUsers( response )
            var users = Model.filterUsers( searchString )
            View.setUsers( users )
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var onUsersListFilterChange = function ( e , value ) {
    searchString = value
    
    var users = Model.filterUsers( searchString )
    View.setUsers( users )
}

var onSelectUser = function ( e , user ) {
    View.selectUser( user )
}

EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, init )
EventBus.addEventListener( Events.SECTION.SHOW, onSectionShow )

EventBus.addEventListener( Events.SECTION.USERS.LIST_FILTER_CHANGE, onUsersListFilterChange )
EventBus.addEventListener( Events.SECTION.USERS.SELECT_USER, onSelectUser )

