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

var init = function ( container ) {
    Container = container
    
    $monthlyInstanceBudget   = Container.find( '.monthlyInstanceBudget' )
    $monthlyInstanceSpending = Container.find( '.monthlyInstanceSpending' )
    $monthlyStorageBudget    = Container.find( '.monthlyStorageBudget' )
    $monthlyStorageSpending  = Container.find( '.monthlyStorageSpending' )
    $storageQuota            = Container.find( '.storageQuota' )
    $storageUsed             = Container.find( '.storageUsed' )
}

var setUsers = function ( users ) {
    
    var monthlyInstanceBudgetTotal   = 0
    var monthlyInstanceSpendingTotal = 0
    var monthlyStorageBudgetTotal    = 0
    var monthlyStorageSpendingTotal  = 0
    var storageQuotaTotal            = 0
    var storageUsedTotal             = 0
    
    $.each( users, function ( i, user ) {
        if ( user.sandboxReport ) {
            monthlyInstanceBudgetTotal += user.sandboxReport.monthlyInstanceBudget
            monthlyInstanceSpendingTotal += user.sandboxReport.monthlyInstanceSpending
            monthlyStorageBudgetTotal += user.sandboxReport.monthlyStorageBudget
            monthlyStorageSpendingTotal += user.sandboxReport.monthlyStorageSpending
            storageQuotaTotal += user.sandboxReport.storageQuota
            storageUsedTotal += user.sandboxReport.storageUsed
        }
    } )
    
    $monthlyInstanceBudget.stop().hide().html( monthlyInstanceBudgetTotal ).fadeIn()
    $monthlyInstanceSpending.stop().hide().html( monthlyInstanceSpendingTotal ).fadeIn()
    $monthlyStorageBudget.stop().hide().html( monthlyStorageBudgetTotal ).fadeIn()
    $monthlyStorageSpending.stop().hide().html( monthlyStorageSpendingTotal ).fadeIn()
    $storageQuota.stop().hide().html( storageQuotaTotal ).fadeIn()
    $storageUsed.stop().hide().html( storageUsedTotal ).fadeIn()
}

module.exports = {
    init      : init
    , setUsers: setUsers
}