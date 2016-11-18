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
        View.showUsersListSection()
        loadUsers()
    }
}

var updateView = function () {
    var users = Model.filterUsers( searchString )
    View.setUsers( users )
}

var loadUsers = function () {
    var users     = false
    var budgets    = false
    
    var checkResponses = function () {
        if( users && budgets ){
            Model.setUsers( users , budgets )
            updateView()
        }
    }
    
    var userParams = {
        url      : '/user/list'
        , success: function ( response ) {
            users = response
            checkResponses()
        }
    }
    EventBus.dispatch( Events.AJAX.GET, null, userParams )
    
    
    var budgetParams = {
        url      : '/budget/report'
        , success: function ( response ) {
            budgets = response
            checkResponses()
        }
    }
    EventBus.dispatch( Events.AJAX.REQUEST, null, budgetParams )
    
    
}

var onUsersListFilterChange = function ( e, value ) {
    searchString = value
    updateView()
}

var onSelectUser = function ( e, user ) {
    Model.setSelectedUser( user )
    View.selectUser( user )
}

var onShowUsersSection = function ( e ) {
    
    switch ( e.type ) {
        case Events.SECTION.USERS.SHOW_USERS_LIST:
            loadUsers()
            View.showUsersListSection()
            break
        
        case Events.SECTION.USERS.SHOW_INVITE_USER:
            View.showInviteUserSection()
            break
        
        case Events.SECTION.USERS.SHOW_EDIT_USER:
            View.showEditUserSection()
            break
        
        case Events.SECTION.USERS.SHOW_DELETE_USER:
            View.showDeleteUserSection()
            break
    }
    
}


EventBus.addEventListener( Events.SECTION.NAV_MENU.LOADED, init )
EventBus.addEventListener( Events.SECTION.SHOW, onSectionShow )

EventBus.addEventListener( Events.SECTION.USERS.LIST_FILTER_CHANGE, onUsersListFilterChange )
EventBus.addEventListener( Events.SECTION.USERS.SELECT_USER, onSelectUser )


EventBus.addEventListener( Events.SECTION.USERS.SHOW_USERS_LIST, onShowUsersSection )
EventBus.addEventListener( Events.SECTION.USERS.SHOW_INVITE_USER, onShowUsersSection )
EventBus.addEventListener( Events.SECTION.USERS.SHOW_EDIT_USER, onShowUsersSection )
EventBus.addEventListener( Events.SECTION.USERS.SHOW_DELETE_USER, onShowUsersSection )