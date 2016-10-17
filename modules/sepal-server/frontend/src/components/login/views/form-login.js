/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var Animation     = require( '../../animation/animation' )
var FormValidator = require( '../../form/form-validator' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = form
    FormNotify = form.find( '.form-notify' )
    
    Animation.animateIn( $( "#login" ) )
    Form.submit( submit )
    // bindEvents()
}

var show = function ( tokenStatus ) {
    var input = null
    if ( tokenStatus ) {
        Form.find( 'input[name=url]' ).val( tokenStatus.invitation ? '/user/activate' : '/user/password/reset' )
        input = Form.find( 'input[name=password]' )
        
        Form.find( 'input[name=user]' ).val( tokenStatus.user.username ).prop( 'readonly', true )
        Form.find( 'input[name=token]' ).val( tokenStatus.token )
        var submitText = tokenStatus.invitation ? 'Accept Invitation' : 'Reset Password'
        Form.find( 'button[type=submit]' ).html( '<i class="fa fa-sign-in" aria-hidden="true"></i> ' + submitText )
        
    } else {
        Form.find( 'input[name=url]' ).val( '/user/login' )
        input = Form.find( 'input[name=user]' )
        
        Form.find( '.password2-section' ).remove()
        Form.find( 'input[name=token]' ).remove()
        Form.find( 'button[type=submit]' ).html( '<i class="fa fa-sign-in" aria-hidden="true"></i> Login' )
        
    }
    
    setTimeout( function () {
        input.trigger( 'focus' )
    }, 2500 )
}

var validateNewPasswords = function () {
    var password  = Form.find( '[name=password]' )
    var password2 = Form.find( '[name=password2]' )
    if ( password.val() !== password2.val() ) {
        FormValidator.addError( password )
        FormValidator.addError( password2 )
        FormValidator.showError( FormNotify, 'New passwords must be the same' )
        return false
    } else {
        return true
    }
}

var login = function () {
    var username = Form.find( 'input[name=user]' ).val()
    var password = Form.find( 'input[name=password]' ).val()
    var params   = {
        url         : '/user/login'
        , error     : null
        , beforeSend: function ( xhr ) {
            xhr.setRequestHeader( "Authorization", "Basic " + btoa( username + ":" + password ) );
        }
        , complete  : function ( object, status ) {
            
            switch ( status ) {
                case 'error' :
                    
                    FormValidator.addError( Form.find( 'input' ) )
                    FormValidator.showError( FormNotify, 'Invalid username or password' )
                    break
                
                case 'success' :
                    
                    var user = object.responseJSON
                    EventBus.dispatch( Events.APP.USER_LOGGED_IN, this, user )
                    
                    break
            }
        }
    }
    EventBus.dispatch( Events.AJAX.POST, this, params )
}

var submitPassword = function () {
    var url      = Form.find( 'input[name=url]' ).val()
    var username = Form.find( 'input[name=user]' ).val()
    var password = Form.find( 'input[name=password]' ).val()
    var token    = Form.find( 'input[name=token]' ).val()
    var params   = {
        url       : url
        , data    : { password: password, token: token }
        , error   : null
        , complete: function () {
            login( username, password )
        }
    }
    EventBus.dispatch( Events.AJAX.POST, this, params )
}

var submit = function ( e ) {
    e.preventDefault()
    var valid     = FormValidator.validateForm( Form )
    var url       = Form.find( 'input[name=url]' ).val()
    var loggingIn = url === '/user/login'
    if ( !loggingIn && valid )
        valid = validateNewPasswords()
    
    if ( valid ) {
        if ( loggingIn )
            login()
        else {
            submitPassword()
        }
    }
}

var hide = function () {
    Form.velocitySlideUp()
}

module.exports = {
    init  : init
    , show: show
    , hide: hide
}