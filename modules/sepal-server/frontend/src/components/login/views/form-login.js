/**
 * @author Mino Togna
 */
var EventBus      = require( '../../event/event-bus' )
var Events        = require( '../../event/events' )
var Animation     = require( '../../animation/animation' )
var FormValidator = require( '../../form-validator/form-validator' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = form
    FormNotify = form.find( '.form-notify' )
    
    var $login = $( "#login" )
    Animation.animateIn( $login, function () {
        //TODO
        $login.find( 'input[name=user]' ).focusin()
    } )
    
    bindEvents()
}

var show = function ( invitation ) {
    if ( invitation ) {
        
        Form.find( 'input[name=user]' ).val( invitation.username ).prop( 'readonly', true )
        Form.find( 'input[name=invitationId]' ).val( invitation.invitationId )
        Form.find( 'button[type=submit]' ).html( '<i class="fa fa-sign-in" aria-hidden="true"></i> Accept Invitation' )
        
    } else {
        
        Form.find( '.password2-section' ).remove()
        Form.find( 'input[name=invitationId]' ).remove()
        Form.find( 'button[type=submit]' ).html( '<i class="fa fa-sign-in" aria-hidden="true"></i> Login' )
        
    }
}

var bindEvents = function () {
    
    Form.submit( function ( e ) {
        e.preventDefault()
        
        FormValidator.resetFormErrors( Form, FormNotify )
        
        var params = {
            url       : '/api/login'
            , method  : 'POST'
            , data    : Form.serialize()
            , error   : null
            , complete: function ( object, status ) {
                
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
        
        EventBus.dispatch( Events.AJAX.REQUEST, this, params )
    } )
    
}

var hide = function () {
    Form.velocitySlideUp()
}

module.exports = {
    init  : init
    , show: show
    , hide: hide
}