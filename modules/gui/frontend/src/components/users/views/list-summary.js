/**
 * @author Mino Togna
 */

var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container                = null
var $monthlyInstanceBudget   = null
var $monthlyInstanceSpending = null
var $monthlyStorageBudget    = null
var $monthlyStorageSpending  = null
var $storageQuota            = null
var $storageUsed             = null
var $activeUsersCounts       = null

var init = function ( container ) {
    Container = container
    
    $monthlyInstanceBudget   = Container.find( '.monthlyInstanceBudget' )
    $monthlyInstanceSpending = Container.find( '.monthlyInstanceSpending' )
    $monthlyStorageBudget    = Container.find( '.monthlyStorageBudget' )
    $monthlyStorageSpending  = Container.find( '.monthlyStorageSpending' )
    $storageQuota            = Container.find( '.storageQuota' )
    $storageUsed             = Container.find( '.storageUsed' )
    $activeUsersCounts       = Container.find( '.active-users-counts' )
}

var setUsers = function ( users ) {
    
    var monthlyInstanceBudgetTotal   = 0
    var monthlyInstanceSpendingTotal = 0
    var monthlyStorageBudgetTotal    = 0
    var monthlyStorageSpendingTotal  = 0
    var storageQuotaTotal            = 0
    var storageUsedTotal             = 0
    
    $.each( users, function ( i, user ) {
        var spending = user.getSpending()
        if ( spending ) {
            monthlyInstanceBudgetTotal += spending.monthlyInstanceBudget
            monthlyInstanceSpendingTotal += spending.monthlyInstanceSpending
            monthlyStorageBudgetTotal += spending.monthlyStorageBudget
            monthlyStorageSpendingTotal += spending.monthlyStorageSpending
            storageQuotaTotal += spending.storageQuota
            storageUsedTotal += spending.storageUsed
        }
    } )
    
    $activeUsersCounts.stop().hide().html( "("+ users.length + ")" ).fadeIn()
    
    $monthlyInstanceBudget.stop().hide().html( monthlyInstanceBudgetTotal.toFixed( 0 ) ).fadeIn()
    $monthlyInstanceSpending.stop().hide().html( monthlyInstanceSpendingTotal.toFixed( 0 ) ).fadeIn()
    $monthlyStorageBudget.stop().hide().html( monthlyStorageBudgetTotal.toFixed( 0 ) ).fadeIn()
    $monthlyStorageSpending.stop().hide().html( monthlyStorageSpendingTotal.toFixed( 0 ) ).fadeIn()
    $storageQuota.stop().hide().html( storageQuotaTotal.toFixed( 0 ) ).fadeIn()
    $storageUsed.stop().hide().html( storageUsedTotal.toFixed( 0 ) ).fadeIn()
}

module.exports = {
    init      : init
    , setUsers: setUsers
}