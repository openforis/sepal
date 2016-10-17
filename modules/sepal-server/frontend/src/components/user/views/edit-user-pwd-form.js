/**
 * @author Mino Togna
 */

var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var FormValidator = require( '../../form/form-validator' )
var Loader        = require( '../../loader/loader' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = $( form )
    FormNotify = Form.find( '.form-notify' )
    
    Form.submit( submit )
}

var submit = function ( e ) {
    e.preventDefault()
    
    var valid = FormValidator.validateForm( Form )
    if ( valid ) {
        valid = validateNewPasswords()
    }
    if ( valid ) {
        // submit
        var data   = Form.serialize()
        // EventBus.dispatch( Events.SECTION.USER.CHANGE_PASSWORD, null, data )
        var params = {
            url         : '/user/current/password'
            , data      : data
            , beforeSend: function () {
                Loader.show()
            }
            , success   : function ( response ) {
                Loader.hide( { delay: 200 } )
                FormValidator.showSuccess( FormNotify, 'Password changed' )
                setTimeout( function () {
                    EventBus.dispatch( Events.USER.PASSWORD_CHANGED )
                }, 1600 )
            }
        }
        EventBus.dispatch( Events.AJAX.POST, null, params )
    }
}

var validateNewPasswords = function () {
    var password  = Form.find( '[name=newPassword]' )
    var password2 = Form.find( '[name=newPassword2]' )
    if ( password.val() !== password2.val() ) {
        
        FormValidator.addError( password )
        FormValidator.addError( password2 )
        FormValidator.showError( FormNotify, 'New passwords must be the same' )
        
        return false
    } else {
        return true
    }
}

var reset = function () {
    Form.trigger( 'reset' )
    FormValidator.resetFormErrors( Form, FormNotify )
}

module.exports = {
    init   : init
    , reset: reset
}