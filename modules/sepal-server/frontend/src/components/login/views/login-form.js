/**
 * @author Mino Togna
 */
var EventBus  = require( '../../event/event-bus' )
var Events    = require( '../../event/events' )
var Animation = require( '../../animation/animation' )

var Form       = null
var FormNotify = null

var show = function ( form, invitation ) {
    Form       = form
    FormNotify = form.find( '.form-notify' )
    
    var $login = $( "#login" )
    
    if ( invitation ) {
        // console.log( invitation )
        $login.find( 'input[name=user]' ).val( invitation.username ).prop( 'readonly', true )
        $login.find( 'input[name=invitationId]' ).val( invitation.invitationId )
        $login.find( 'button[type=submit]' ).html( '<i class="fa fa-sign-in" aria-hidden="true"></i> Accept Invitation' )
    } else {
        $login.find( '.password2-section' ).remove()
        $login.find( 'input[name=invitationId]' ).remove()
        $login.find( 'button[type=submit]' ).html( '<i class="fa fa-sign-in" aria-hidden="true"></i> Login' )
    }
    
    Animation.animateIn( $login, function () {
        //TODO
        $login.find( 'input[name=user]' ).focusin()
    } )
    
    bindEvents()
}

var bindEvents = function () {
    
    Form.submit( function ( e ) {
        e.preventDefault()
        
        var params = {
            url         : Form.attr( 'action' )
            , method    : Form.attr( 'method' )
            , data      : Form.serialize()
            , error     : null
            , beforeSend: function () {
                FormNotify.html( '' ).hide()
                Form.find( '.form-group' ).removeClass( 'error' )
            }
            , complete  : function ( object, status ) {
                
                switch ( status ) {
                    case 'error' :
                        
                        FormNotify.html( 'Invalid username or password' ).css( 'opacity', '0' ).show().addClass( 'animated' ).addClass( 'fadeInUp' );
                        setTimeout( function () {
                            FormNotify.css( 'opacity', '1' )
                        }, 100 )
                        
                        Form.find( '.form-group' ).addClass( 'error' )
                        
                        break;
                    
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

module.exports = {
    show: show
}