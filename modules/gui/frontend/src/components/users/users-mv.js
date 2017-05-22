/**
 * @author Mino Togna
 */

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var View     = require( './users-v' )
var Model    = require( './users-m' )

var show = function ( e, target ) {
    if ( target === 'users' ) {
        View.init()
        View.showUsersListSection()
        loadUsers()
    }
}

var updateView = function () {
    View.setUsers( Model.getFilteredUsers() )
    View.setAllUsers( Model.getUsers() )
}

var loadUsers = function () {
    var users   = null
    var budgets = null
    
    var checkResponses = function () {
        if ( users && budgets ) {
            Model.setUsers( users, budgets )
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
    EventBus.dispatch( Events.AJAX.GET, null, budgetParams )
    
    
}

var selectUser = function ( e, user ) {
    Model.setSelectedUser( user )
    View.selectUser( user )
}

var showSection = function ( e ) {
    
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
        
        case Events.SECTION.USERS.SHOW_SEND_INVITATION_USER:
            View.showSendInvitationUserSection()
            break
    }
    
}

EventBus.addEventListener( Events.SECTION.SHOW, show )

EventBus.addEventListener( Events.SECTION.USERS.FILTER.ACTIVE_CHANGED, updateView )
EventBus.addEventListener( Events.SECTION.USERS.SELECT_USER, selectUser )

//show section events
EventBus.addEventListener( Events.SECTION.USERS.SHOW_USERS_LIST, showSection )
EventBus.addEventListener( Events.SECTION.USERS.SHOW_INVITE_USER, showSection )
EventBus.addEventListener( Events.SECTION.USERS.SHOW_EDIT_USER, showSection )
EventBus.addEventListener( Events.SECTION.USERS.SHOW_DELETE_USER, showSection )
EventBus.addEventListener( Events.SECTION.USERS.SHOW_SEND_INVITATION_USER, showSection )