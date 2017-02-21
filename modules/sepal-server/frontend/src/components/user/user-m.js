/**
 * @author Mino Togna
 */

var User = function ( userDetails ) {
    $.extend( this, userDetails )
    this.sandboxReport = null
}

User.prototype.isAdmin = function () {
    var isAdmin = false
    $.each( this.roles, function ( i, role ) {
        if ( role.toUpperCase() === 'APPLICATION_ADMIN' ) {
            isAdmin = true
            return false
        }
    } )
    return isAdmin
}

User.prototype.isActive = function () {
    return this.hasStatus( 'ACTIVE' )
}

User.prototype.isPending = function () {
    return this.hasStatus( 'PENDING' )
}

User.prototype.isLocked = function () {
    return this.hasStatus( 'LOCKED' )
}

User.prototype.hasStatus = function ( status ) {
    return this.status && this.status.toUpperCase() === status
}

User.prototype.setUserSandboxReport = function ( data ) {
    this.sandboxReport = data
}

User.prototype.getSessions = function () {
    return this.sandboxReport.sessions
}

User.prototype.getSessionById = function ( sessionId ) {
    var session = null
    $.each( this.getSessions(), function ( i, s ) {
        if ( s.id === sessionId ) {
            session = s
            return false
        }
    } )
    return session
}

User.prototype.getSpending = function () {
    return this.sandboxReport.spending
}

User.prototype.hasBudgetExceeded = function () {
    var spending = this.getSpending()
    
    var budgetExceeded =
            spending.monthlyInstanceBudget <= spending.monthlyInstanceSpending ||
            spending.monthlyStorageBudget <= spending.monthlyStorageSpending ||
            spending.storageQuota <= spending.storageUsed
    
    return budgetExceeded
}

User.prototype.hasBudget0 = function () {
    var spending = this.getSpending()
    
    var budget0 =
            spending.monthlyInstanceBudget == 0 &&
            spending.monthlyStorageBudget == 0 &&
            spending.storageQuota == 0
    
    return budget0
}

module.exports = function ( userDetails ) {
    return new User( userDetails )
}