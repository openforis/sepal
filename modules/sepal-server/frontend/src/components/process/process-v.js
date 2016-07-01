/**
 * @author Mino Togna
 */
require( './process.scss' )
var Sepal    = require( '../main/sepal' )
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )
var template = require( './process.html' )
var html     = $( template( {} ) )

var rStudioImg = require( './r-studio.png' )

//link to rstudio
///user/$USER/rstudio-server/
var apps = null
var init = function () {
    var appSection = $( '#app-section' ).find( '.process' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        apps = html.find( '.apps' )
        
        var rStudioBtn = $( '<a class="btn btn-base round r-studio" target="_blank"></a>' )
        var href       = '/user/' + Sepal.User.username + '/rstudio-server/'
        rStudioBtn.attr( 'href', href )
        rStudioBtn.append( '<img src="' + rStudioImg + '"/>' )
        apps.append( rStudioBtn )
    }
}

module.exports = {
    init: init
}