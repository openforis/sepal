/**
 * 
 * Login module
 * 
 * @author Mino Togna
 */

var EventBus	= require( '../event-bus/event-bus' );
// var $ = require( 'jquery' )

var template = require( './login.html' )
var html = $( template( {} ) )

var addLoginForm = function(){

    $("body").find( '.app' ).append( html )

    var form = html.find('form')

    form.submit( function(e){
        e.preventDefault()

        var params = {
            url         : form.attr( 'action' )
            , method    : form.attr( 'method' )
            , data      : form.serialize()
            , error     : null
            , complete  : function ( object , status ) {

                switch ( status ){
                    case 'error' :

                        form.find( 'fieldset' ).addClass('has-danger')
                        form.find( 'input' ).addClass('form-control-danger')

                        break;
                    case 'success' :

                        var user = object.responseJSON

                        html.fadeOut( function(){
                            html.remove()
                        })
                        EventBus.dispatch( 'user.logged' , this , user )

                        break;
                }

            }
        }

        EventBus.dispatch( 'ajax' , this , params )
    })
}

addLoginForm()



