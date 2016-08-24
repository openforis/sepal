/**
 * @author Mino Togna
 */
var EventBus  = require( '../../event/event-bus' )
var Events    = require( '../../event/events' )
var Animation = require( '../../animation/animation' )

var Form       = null
var FormNotify = null

var init = function ( form ) {
    Form       = form
    FormNotify = form.find( '.form-notify' )
    
    bindEvents()
}

var bindEvents = function () {
    
    Form.submit( function ( e ) {
        e.preventDefault()
        
        var params = {
            url         : Form.attr( 'action' )
            , method    : Form.attr( 'method' )
            , data      : Form.serialize()
            // , error     : null
            , beforeSend: function () {
                FormNotify.html( '' ).hide()
                Form.find( '.form-group' ).removeClass( 'error' )
            }
            , complete  : function ( object, status ) {
                
                switch ( status ) {
                    case 'error' :
                        
                        FormNotify.html( 'Unable to find your account' ).css( 'opacity', '0' ).show().addClass( 'animated' ).addClass( 'fadeInUp' );
                        setTimeout( function () {
                            FormNotify.css( 'opacity', '1' )
                        }, 100 )
                        
                        // Form.find( '.form-group' ).addClass( 'error' )
                        
                        break;
                    
                    case 'success' :
                        
                        // var user = object.responseJSON
                        // EventBus.dispatch( Events.APP.USER_LOGGED_IN, this, user )
                        
                        break
                }
            }
            
        }
        
        EventBus.dispatch( Events.AJAX.REQUEST, this, params )
    } )
    
}

var show = function ( opts ) {
    Form.velocitySlideDown( opts )
}

var hide = function ( opts ) {
    Form.velocitySlideUp( opts )
}

module.exports = {
    init  : init
    , show: show
    , hide: hide
}