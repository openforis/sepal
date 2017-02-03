/**
 * @author Mino Togna
 */
require( './process.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var rStudioImg = require( './img/r-studio.png' )

var html              = null
var $apps             = null
var $appGroup         = null
var $btnCloseAppGroup = null

var init = function () {
    var template = require( './process.html' )
    html         = $( template( {} ) )
    
    var appSection = $( '#app-section' ).find( '.process' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        $apps             = html.find( '.apps' )
        $appGroup         = html.find( '.app-group' )
        $btnCloseAppGroup = html.find( '.btn-close-group' )
        
        $btnCloseAppGroup.click( function () {
            $appGroup.velocitySlideUp( {
                begin: function ( elements ) {
                    $( elements ).css( 'height', '100%' )
                }
            } )
            $apps.velocitySlideDown( {
                complete: function ( elements ) {
                    $( elements ).css( 'height', '100%' )
                }
            } )
        } )
        
    }
    
    $apps.show()
    $appGroup.hide()
}

var setApps = function ( apps ) {
    $apps.empty()
    
    // data visualization app
    var dataVisBtn = $( '<div><button class="btn btn-base app data-vis"><i class="fa fa-map-o" aria-hidden="true"></i> Data visualization</button></div>' )
    dataVisBtn.click( function ( e ) {
        EventBus.dispatch( Events.APP_MANAGER.OPEN_DATAVIS )
    } )
    $apps.append( dataVisBtn )
    
    // rStudio app
    var rStudioBtn = $( '<div><button class="btn btn-base app r-studio"><img src="' + rStudioImg + '"/></button></div>' )
    rStudioBtn.click( function ( e ) {
        EventBus.dispatch( Events.APP_MANAGER.OPEN_RSTUDIO, null, '/sandbox/rstudio/' )
    } )
    $apps.append( rStudioBtn )
    
    // all other apps
    $.each( apps, function ( i, app ) {
        if ( app.apps ) {
            addAppGroup( app, $apps )
        } else {
            addAppButton( app, $apps )
        }
    } )
}

var addAppButton = function ( app, container ) {
    var div = $( '<div/>' )
    
    var btn = $( '<button class="btn btn-base app"></button>' )
    btn.html( app.label )
    
    btn.click( function ( e ) {
        EventBus.dispatch( Events.APP_MANAGER.OPEN_IFRAME, null, app.path )
    } )
    
    div.append( btn )
    container.append( div )
}

var addAppGroup = function ( app, container ) {
    var div = $( '<div/>' )
    
    var btn = $( '<div class="btn btn-base app"></div>' )
    btn.html( '<i class="fa fa-folder" aria-hidden="true"></i> ' + app.label )
    
    btn.click( function ( e ) {
        $appGroup.find( 'div' ).remove()
        $.each( app.apps, function ( i, app ) {
            addAppButton( app, $appGroup )
        } )
        
        $apps.velocitySlideUp( {
            begin: function ( elements ) {
                $( elements ).css( 'height', '100%' )
            }
        } )
        $appGroup.velocitySlideDown( {
            complete: function ( elements ) {
                $( elements ).css( 'height', '100%' )
            }
        } )
        
    } )
    
    div.append( btn )
    container.append( div )
}

module.exports = {
    init     : init
    , setApps: setApps
}