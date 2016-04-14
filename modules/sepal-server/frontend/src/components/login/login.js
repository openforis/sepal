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

$("body").find( '.app' ).append( html )

var form = html.find('form')

form.submit( function(e){
    e.preventDefault()

    var params = {
        url         : form.attr( 'action' )
        , method    : form.attr( 'method' )
        , data      : form.serialize()
        , complete  : function ( object , status ) {

            switch ( status ){
                case 'error' :

                    console.log( arguments )
                    console.log('error')

                    form.find( 'fieldset' ).addClass('has-danger')
                    form.find( 'input' ).addClass('form-control-danger')

                    break;
                case 'success' :
                    console.log( arguments )
                    console.log('logged')


                    var user = object.responseJSON
                    EventBus.dispatch( 'user.logged' , this , user )
                    break;
            }

        }
    }

    EventBus.dispatch( 'ajax' , this , params )
})




