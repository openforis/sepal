/**
 * @author Mino Togna
 */
require( './process.scss' )

var UserMV = require( '../user/user-mv' )
// var EventBus = require( '../event/event-bus' )
// var Events   = require( '../event/events' )
var html = null

var rStudioImg = require( './img/r-studio.png' )

//link to rstudio
var apps = null
var init = function () {
    var template = require( './process.html' )
    html         = $( template( {} ) )
    
    var appSection = $( '#app-section' ).find( '.process' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        apps = html.find( '.apps' )
        
        var rStudioBtn = $( '<a class="btn btn-base round app r-studio" target="_blank"></a>' )
        var href       = '/sandbox/rstudio/'
        rStudioBtn.attr( 'href', href )
        rStudioBtn.append( '<img src="' + rStudioImg + '"/>' )
        apps.append( rStudioBtn )
        
        apps.append('' +
            '<div>' +
            '    <a class="btn btn-base round app"' +
            '       target="_blank" ' +
            '       href="/sandbox/shiny/accuracy-assessment/">' +
            '        Accuracy Assessment' +
            '    </a>' +
            '</div>')
        
        apps.append('' +
            '<div>' +
            '    <a class="btn btn-base round app"' +
            '       target="_blank" ' +
            '       href="/sandbox/shiny/visualize/">' +
            '        Visualize' +
            '    </a>' +
            '</div>')
    }
}

module.exports = {
    init: init
}