/**
 * @author Mino Togna
 */

require( './budget-check.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var numeral  = require( 'numeral' )

var budgetExceeded = false
var budget0        = false
var spending       = false

var template = require( './budget-check.html' )
var html     = $( template( {} ) )

var check = function ( container ) {
    var budgetCheck = container.parent().find( '.budget-check' )
    if ( budgetCheck.length > 0 ) {
        budgetCheck.remove()
    }
    
    if ( budgetExceeded || budget0 ) {
        container.hide( 0 )
        show( container )
    } else {
        container.show( 0 )
    }
}

var show = function ( container ) {
    
    var budgetCheck       = html.clone()
    var rowBudget0        = budgetCheck.find( '.row-budget-0' )
    var rowBudgetExceeded = budgetCheck.find( '.row-budget-exceeded' )
    
    budgetCheck.find( '.monthlyInstanceBudget' ).html( numeral( spending.monthlyInstanceBudget ).format( '0.[00]' ) + " USD" )
    budgetCheck.find( '.monthlyInstanceSpending' ).html( numeral( spending.monthlyInstanceSpending ).format( '0.[00]' ) + " USD" )
    budgetCheck.find( '.monthlyStorageBudget' ).html( numeral( spending.monthlyStorageBudget ).format( '0.[00]' ) + " USD" )
    budgetCheck.find( '.monthlyStorageSpending' ).html( numeral( spending.monthlyStorageSpending ).format( '0.[00]' ) + " USD" )
    budgetCheck.find( '.storageQuota' ).html( numeral( spending.storageQuota ).format( '0.[00]' ) + " GB" )
    budgetCheck.find( '.storageUsed' ).html( numeral( spending.storageUsed ).format( '0.[00]' ) + " GB" )
    
    if ( budget0 ) {
        rowBudget0.show()
        rowBudgetExceeded.hide()
    } else {
        rowBudget0.hide()
        rowBudgetExceeded.show()
    }
    
    container.parent().append( budgetCheck )
}

var updateUserBudget = function ( e, user ) {
    
    
    spending = user.sandboxReport.spending
    
    budget0 =
        spending.monthlyInstanceBudget == 0 &&
        spending.monthlyStorageBudget == 0 &&
        spending.storageQuota == 0
    
    
    budgetExceeded =
        spending.monthlyInstanceBudget <= spending.monthlyInstanceSpending ||
        spending.monthlyStorageBudget <= spending.monthlyStorageSpending ||
        spending.storageQuota <= spending.storageUsed
    
}

EventBus.addEventListener( Events.USER.USER_SANDBOX_REPORT_LOADED, updateUserBudget )

module.exports = {
    check: check
}