/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var UserMV   = require( '../../user/user-mv' )
var numeral  = require( 'numeral' )

var btnUser                 = null
var btnLogout               = null
var containerHourlyCost     = null
var containerBudgetExceeded = null
var hourlyCost              = 0
var budgetExceeded          = false
var budget0                 = false

var initialized = false

var init = function ( container ) {
    container = $( container )
    
    btnUser                 = container.find( ".btn-user" )
    btnLogout               = container.find( ".btn-logout" )
    containerHourlyCost     = container.find( ".hourly-cost" )
    containerBudgetExceeded = container.find( ".budget-exceeded" )
    
    btnUser.find( '.username' ).html( UserMV.getCurrentUser().username )
    btnUser.click( function ( e ) {
        e.preventDefault()
        
        EventBus.dispatch( Events.SECTION.NAV_MENU.COLLAPSE )
        EventBus.dispatch( Events.SECTION.SHOW, null, "user" )
    } )
    
    btnLogout.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.AJAX.GET, null, { url: "/logout" } )
        EventBus.dispatch( Events.USER.LOGGED_OUT )
    } )
    
    initialized = true
    
    updateBudgetContainer()
}


var updateUserBudget = function ( user ) {
    hourlyCost = 0
    $.each( user.sandboxReport.sessions, function ( i, session ) {
        hourlyCost += session.instanceType.hourlyCost
    } )
    
    var spending = user.sandboxReport.spending
    
    budget0 =
        spending.monthlyInstanceBudget == 0 &&
        spending.monthlyStorageBudget == 0 &&
        spending.storageQuota == 0
    
    budgetExceeded =
        spending.monthlyInstanceBudget <= spending.monthlyInstanceSpending ||
        spending.monthlyStorageBudget <= spending.monthlyStorageSpending ||
        spending.storageQuota <= spending.storageUsed
    
    updateBudgetContainer()
}

var updateBudgetContainer = function () {
    if ( initialized ) {
        containerHourlyCost.html( '<i class="fa fa-usd" aria-hidden="true"></i> ' + numeral( hourlyCost ).format( '0.[00]' ) + '/h' )
        
        if ( budgetExceeded || budget0 ) {
            if ( budget0 ) {
                containerBudgetExceeded.html( '<i class="fa fa-exclamation-circle" aria-hidden="true"></i> No Budget' )
            } else {
                containerBudgetExceeded.html( '<i class="fa fa-exclamation-circle" aria-hidden="true"></i> Budget exceeded' )
            }
            
            containerBudgetExceeded.fadeIn()
            containerHourlyCost.fadeOut()
        } else {
            containerBudgetExceeded.fadeOut()
            containerHourlyCost.fadeIn()
        }
    }
}

module.exports = {
    init              : init
    , updateUserBudget: updateUserBudget
}