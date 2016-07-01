/**
 * @author Mino Togna
 */

var download = function ( url, data ) {
    
    var iFrame = $( "<iframe id='_exportIframe' style='display: none;' ></iframe>" )
    $( "body" ).append( iFrame )
    
    var form = $( "<form target='_exportIframe' method='get' action='" + url + "'></form>" )
    
    if ( data ) {
        //add an hidden field to the form for each parameter
        $.each( data, function ( fieldName, value ) {
            form.append( $( "<input type='hidden' name='" + fieldName + "' value='" + value + "' />" ) )
        } );
    }
    
    $( "body" ).append( form )
    
    form.submit()
    
    //remove the elements at the end
    setTimeout( function () {
        iFrame.remove()
        form.remove()
    }, 10000 )
}

module.exports = {
    download: download
}