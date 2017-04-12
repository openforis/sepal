/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var FormUtils     = require( '../../form/form-utils' )
var Loader        = require( '../../loader/loader' )
var UserMV        = require( '../../user/user-mv' )

var Container        = null
var Form             = null
var FormNotify       = null
// Form elements
var BtnStatusActive  = null
var BtnStatusPending = null
var BtnStatusLocked  = null

var selectedUser = null

var init = function ( container ) {
    Container = $( container )
    initForm()
}


var getContainer = function () {
    return Container
}

var selectUser = function ( user ) {
    selectedUser = user
    updateForm()
}

var initForm = function () {
    Form       = Container.find( 'form' )
    FormNotify = Form.find( '.form-notify' )
    
    BtnStatusActive  = Form.find( '.btn-status-active' )
    BtnStatusPending = Form.find( '.btn-status-pending' )
    BtnStatusLocked  = Form.find( '.btn-status-locked' )
    
    Form.submit( submitForm )
    
    Form.find( '.btn-cancel' ).click( function ( e ) {
        e.preventDefault()
        
        updateForm()
        
        EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
    } )
    
    var onBtnStatusClick = function ( e ) {
        var btn    = $( this )
        var status = btn.val()
        
        Form.find( '[name=status]' ).closest( '.form-group' ).removeClass( 'error' )
        
        Form.find( '.btn-status' ).removeClass( 'active' )
        Form.find( '.btn-status-' + status ).addClass( 'active' )
        Form.find( '[name=status]' ).val( status )
    }
    BtnStatusActive.click( onBtnStatusClick )
    BtnStatusPending.click( onBtnStatusClick )
    BtnStatusLocked.click( onBtnStatusClick )
}

var updateForm = function () {
    FormValidator.resetFormErrors( Form )
    FormUtils.populateForm( Form, selectedUser )
    
    var spending = selectedUser.getSpending()
    Form.find( '[name=monthlyInstanceBudget]' ).val( spending.monthlyInstanceBudget )
    Form.find( '[name=monthlyStorageBudget]' ).val( spending.monthlyStorageBudget )
    Form.find( '[name=storageQuota]' ).val( spending.storageQuota )
    
    if ( selectedUser ) {
        var status = selectedUser.status
        
        Form.find( '.btn-status-' + status ).click()
        
        if ( status === 'pending' ) {
            BtnStatusActive.disable()
        } else {
            BtnStatusActive.enable()
        }
    }
}

var submitForm = function ( e ) {
    e.preventDefault()
    
    var valid = FormValidator.validateForm( Form )
    valid     = (valid) ? FormValidator.validateString( Form.find( '[name=status]' ), 'Invalid Status', FormNotify ) : false
    if ( valid ) {
        
        var userDetailsSaved = false
        var budgetSaved      = false
        var checkResponses   = function () {
            if ( userDetailsSaved && budgetSaved ) {
                Loader.hide( { delay: 200 } )
                
                FormValidator.showSuccess( Form.find( '.form-notify' ), "Information saved" )
                
                setTimeout( function () {
                    EventBus.dispatch( Events.SECTION.USERS.SHOW_USERS_LIST )
                }, 1600 )
            }
        }
        
        Loader.show()
        
        // submit
        var data        = Form.serialize()
        var userId      = parseInt( Form.find( '[name=id]' ).val() )
        var currentUser = UserMV.getCurrentUser()
        
        var params = {
            url      : '/user/details'
            , data   : data
            , success: function ( response ) {
                if ( userId === currentUser.id ) {
                    EventBus.dispatch( Events.USER.RELOAD_USER_DETAILS )
                }
                userDetailsSaved = true
                checkResponses()
            }
        }
        EventBus.dispatch( Events.AJAX.POST, this, params )
        
        
        var budgetParams = {
            url      : '/budget'
            , data   : {
                username             : Form.find( '[name=username]' ).val(),
                monthlyInstanceBudget: Form.find( '[name=monthlyInstanceBudget]' ).val(),
                monthlyStorageBudget : Form.find( '[name=monthlyStorageBudget]' ).val(),
                storageQuota         : Form.find( '[name=storageQuota]' ).val()
            }
            , success: function () {
                budgetSaved = true
                checkResponses()
            }
        }
        EventBus.dispatch( Events.AJAX.POST, this, budgetParams )
        
        
    }
}

module.exports = {
    init          : init
    , getContainer: getContainer
    , selectUser  : selectUser
}