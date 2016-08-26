/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var FormUtils     = require( '../../form/form-utils' )

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
    
    if ( valid ) {
        // submit
        var data = Form.serialize()
    }
}

module.exports = {
    init          : init
    , getContainer: getContainer
    , selectUser  : selectUser
}