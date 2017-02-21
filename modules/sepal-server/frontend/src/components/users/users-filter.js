/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var searchString   = ""
var activeUsers    = true
var pendingUsers   = true
var lockedUsers    = true
var budgetExceeded = false

var searchStringChange = function ( e, value ) {
    searchString = value.toLowerCase()
    triggerChange()
}

var activeUsersChange = function ( e, value ) {
    activeUsers = value
    triggerChange()
}

var pendingUsersChange = function ( e, value ) {
    pendingUsers = value
    triggerChange()
}

var lockedUsersChange = function ( e, value ) {
    lockedUsers = value
    triggerChange()
}

var budgetExceededChange = function ( e, value ) {
    budgetExceeded = value
    triggerChange()
}

var triggerChange = function () {
    EventBus.dispatch( Events.SECTION.USERS.FILTER.CHANGED )
}

// filter users methods
var filterUsers = function ( users ) {
    var filteredUsers = users.filter( filterUser )
    return filteredUsers
}

var filterUser  = function ( user ) {
    var match = false
    if ( filterUserBySearchString( user ) && filterUserByStatus( user ) && filterUserByBudgetExceeded( user ) ) {
        match = true
    }
    return match
}

var filterUserBySearchString = function ( user ) {
    var match = $.containsString( user.name.toLowerCase(), searchString )
        || $.containsString( user.username.toLowerCase(), searchString )
        || $.containsString( user.organization.toLowerCase(), searchString )
    return match
}

var filterUserByStatus = function ( user ) {
    var match =
            ( user.isActive() ? activeUsers :
                ( user.isPending() ? pendingUsers :
                    ( user.isLocked() ? lockedUsers : true ) ) )
    return match
}

var filterUserByBudgetExceeded = function ( user ) {
    var match = budgetExceeded ? user.hasBudgetExceeded() : true
    return match
}

module.exports = {
    filterUsers: filterUsers
}

EventBus.addEventListener( Events.SECTION.USERS.FILTER.SEARCH_STRING_CHANGE, searchStringChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_ACTIVE_CHANGE, activeUsersChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_PENDING_CHANGE, pendingUsersChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_LOCKED_CHANGE, lockedUsersChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_BUDGET_EXCEEDED_CHANGE, budgetExceededChange )