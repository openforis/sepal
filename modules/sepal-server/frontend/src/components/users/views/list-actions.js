/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var UserMV   = require( '../../user/user-mv' )

var container               = null
// counts
var totalUsersCounts        = null
var totalActiveUsersCounts  = null
//filters
var searchInput             = null
var btnFilterActive         = null
var btnFilterPending        = null
var btnFilterLocked         = null
var btnFilterBudgetExceeded = null
// user actions
var btnInvite               = null
var btnRemove               = null
var btnEdit                 = null
var btnSendInvitation       = null
var selectedUser            = null

var init = function ( Container ) {
    selectedUser = null
    
    container = $( Container )
    
    // counts
    totalUsersCounts       = container.find( '.total-users-counts' )
    totalActiveUsersCounts = container.find( '.total-active-users-counts' )
    
    initFilters()
    initUserActions()
    
    updateActionButtons()
}

var initFilters = function () {
    // filters
    searchInput             = container.find( 'input[name=search]' )
    btnFilterActive         = container.find( '.btn-filter-active' )
    btnFilterPending        = container.find( '.btn-filter-pending' )
    btnFilterLocked         = container.find( '.btn-filter-locked' )
    btnFilterBudgetExceeded = container.find( '.btn-filter-budget-exceeded' )
    
    // filters event handlers
    searchInput.keyup( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.FILTER.SEARCH_STRING_CHANGE, null, searchInput.val() )
    } )
    
    var changeStatus = function ( btn, evt ) {
        btn.toggleClass( 'active' )
        EventBus.dispatch( evt, null, btn.hasClass( 'active' ) )
    }
    
    btnFilterActive.click( function ( e ) {
        changeStatus( btnFilterActive, Events.SECTION.USERS.FILTER.USERS_ACTIVE_CHANGE )
    } )
    btnFilterPending.click( function ( e ) {
        changeStatus( btnFilterPending, Events.SECTION.USERS.FILTER.USERS_PENDING_CHANGE )
    } )
    btnFilterLocked.click( function ( e ) {
        changeStatus( btnFilterLocked, Events.SECTION.USERS.FILTER.USERS_LOCKED_CHANGE )
    } )
    btnFilterBudgetExceeded.click( function ( e ) {
        changeStatus( btnFilterBudgetExceeded, Events.SECTION.USERS.FILTER.USERS_BUDGET_EXCEEDED_CHANGE )
    } )
}

var initUserActions = function () {
    // btn user actions
    btnInvite         = container.find( '.btn-invite' )
    btnRemove         = container.find( '.btn-remove' )
    btnEdit           = container.find( '.btn-edit' )
    btnSendInvitation = container.find( '.btn-send-invitation' )
    
    // user action event handlers
    btnInvite.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_INVITE_USER )
    } )
    btnEdit.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_EDIT_USER )
    } )
    btnRemove.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_DELETE_USER )
    } )
    btnSendInvitation.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.USERS.SHOW_SEND_INVITATION_USER )
    } )
}

var updateActionButtons = function () {
    if ( selectedUser ) {
        btnEdit.enable()
        if ( UserMV.getCurrentUser().id !== selectedUser.id ) {
            btnRemove.enable()
        } else {
            btnRemove.disable()
        }
        selectedUser.isPending() ? btnSendInvitation.enable() : btnSendInvitation.disable()
    } else {
        btnEdit.disable()
        btnRemove.disable()
        btnSendInvitation.disable()
    }
}

var selectUser = function ( user ) {
    selectedUser = user
    updateActionButtons()
}

var setAllUsers = function ( users ) {
    var activeCount = 0
    $.each( users, function ( i, user ) {
        if ( user.isActive() ) {
            activeCount += 1
        }
    } )
    totalUsersCounts.html( users.length )
    totalActiveUsersCounts.html( activeCount )
}

module.exports = {
    init         : init
    , selectUser : selectUser
    , setAllUsers: setAllUsers
}