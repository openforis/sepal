/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

// filter properties
var searchString   = ""
var activeUsers    = true
var pendingUsers   = true
var lockedUsers    = true
var budgetExceeded = false
// sort properties
var sortProperty   = null
var sortDirection  = null

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
    sortUsers( filteredUsers )
    return filteredUsers
}

var filterUser = function ( user ) {
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

// sort users functions
var sortUsers = function ( users ) {
    if ( sortProperty && sortDirection ) {
        
        var compareFunction = null
        if ( sortProperty == 'name' || sortProperty == 'username' )
            compareFunction = compareStrings
        else if ( sortProperty == 'status' )
            compareFunction = compareStatuses
        else
            compareFunction = compareNumbers
        
        users.sort( compareFunction )
        
    }
    
    return users
}

var compareStrings = function ( userA, userB ) {
    var propertyA = userA[ sortProperty ].toLowerCase()
    var propertyB = userB[ sortProperty ].toLowerCase()
    
    var result = null
    if ( propertyA < propertyB )
        result = -1
    else if ( propertyA > propertyB )
        result = 1
    else
        result = 0
    
    return (sortDirection == 'asc') ? result : -(result)
}

var compareStatuses = function ( userA, userB ) {
    
    var setStatusNo = function ( user ) {
        var property = user[ sortProperty ].toLowerCase()
        
        if ( property == 'active' )
            user.statusNo = 1
        else if ( property == 'pending' )
            user.statusNo = 2
        else if ( property == 'locked' )
            user.statusNo = 3
    }
    
    setStatusNo( userA )
    setStatusNo( userB )
    
    var result = userA.statusNo - userB.statusNo
    
    return (sortDirection == 'asc') ? result : -(result)
}

var compareNumbers = function ( userA, userB ) {
    var propertyA = userA.getSpending()[ sortProperty ]
    var propertyB = userB.getSpending()[ sortProperty ]
    
    var result = propertyA - propertyB
    
    return (sortDirection == 'asc') ? result : -(result)
}


var resetSort = function ( e ) {
    setSortProperties( null, null )
}

var activeSort = function ( e, property, direction ) {
    setSortProperties( property, direction )
}

var setSortProperties = function ( property, direction ) {
    sortProperty  = property
    sortDirection = direction
    triggerChange()
}


module.exports = {
    filterUsers: filterUsers
}

//filter events
EventBus.addEventListener( Events.SECTION.USERS.FILTER.SEARCH_STRING_CHANGE, searchStringChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_ACTIVE_CHANGE, activeUsersChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_PENDING_CHANGE, pendingUsersChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_LOCKED_CHANGE, lockedUsersChange )
EventBus.addEventListener( Events.SECTION.USERS.FILTER.USERS_BUDGET_EXCEEDED_CHANGE, budgetExceededChange )

//sort events
EventBus.addEventListener( Events.SECTION.USERS.SORT.RESET, resetSort )
EventBus.addEventListener( Events.SECTION.USERS.SORT.ACTIVE, activeSort )