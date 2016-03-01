<?php

/*
  |--------------------------------------------------------------------------
  | Application Routes
  |--------------------------------------------------------------------------
  |
  | Here is where you can register all of the routes for an application.
  | It's a breeze. Simply tell Laravel the URIs it should respond to
  | and give it the Closure to execute when that URI is requested.
  |
 */

//Route for cronjob
Route::get('tiffvalidator', 'UsgstiffController@cronTiffValidator');
Route::get('cleartemprepo', 'DashboardController@clearTempDownloadRepo');//clear temp repo(download folder) every 5 hours
Route::get('removefile', 'SearchController@removeImages');//to delete the repo date limit set by admin
//Route filter for guest in users access
Route::group(array('before' => 'guest'), function () {
    Route::get('/', 'LoginController@index');
    Route::get('login', 'LoginController@index');
    Route::post('login', 'LoginController@check');
});

//Route filter for logged in users
Route::group(array('before' => 'auth'), function () {
    Route::get('/', 'AccountController@showAccount');
    Route::get('account', 'AccountController@showAccount');
    Route::post('closesession', 'AccountController@closeSession');
    Route::get('dashboard', 'DashboardController@showDashboard');
    Route::post('showfolder', 'DashboardController@showFolders');
    Route::post('subfolder', 'DashboardController@showSubFolders');
    Route::get('terminal', 'SshController@ssh');
    Route::get('terminalData', 'SshController@requestSshSession');
    //search routes
    Route::get('search', 'SearchController@showForm');
    Route::get('searchresults', 'SearchController@searchDatabase');
    Route::get('searchresults/{identifier}/{beginPath}/{endPath}/{beginRow}/{endRow}/{topLeftLatitude01}/{topLeftLongitude01}
        /{bottomRightLatitude01}/{bottomRightLongitude01}/{sensor}/
        {sceneStartTime}/{sceneStopTime}/{name}/{cloud_cover}/{topLeftLatitude}/{topLeftLongitude}
        /{bottomRightLatitude}/{bottomRightLongitude}/{page}', 'SearchController@searchDatabase');
    Route::post('search', 'SearchController@searchDatabase');
    Route::post('imagerepo', 'SearchController@imageRepo');
    Route::post('pathtolatlong', 'SearchController@pathtoLatLong');
    Route::post('findcenter', 'SearchController@adjustZoom');
    Route::get('contact', 'ContactusController@contactUs');
    Route::post('contact', 'ContactusController@contact');
    Route::get('password', 'DashboardController@changePassword');
    Route::post('password', 'DashboardController@checkPassword');
    Route::post('tiffstatus', 'UsgstiffController@checkTiff');
    Route::post('migrate', 'SepalGeoServerController@requestDownload');
    Route::get('migrate', 'SepalGeoServerController@requestDownload');
    Route::get('logout', 'LoginController@logout');
    //download data
    Route::get('downloadfile/{filePath}', 'DashboardController@downloadFileFromDashboard');
    Route::post('compressfolder', 'DashboardController@createZipFromDashboard');
    Route::get('downloadtar/{filePath}', 'DashboardController@downloadZipFromDashboard');
    Route::post('migratecheck', 'DashboardController@migrateCheck');
    Route::get('migrationstatus', 'SepalGeoServerController@showDownloadStatus');
    Route::get('downloadstatus', 'SepalGeoServerController@loadDownloadStatus');
    Route::post('migrationchecker', 'DashboardController@migrationChecker'); //make it as post
    Route::get('removeFromDashboard', 'SepalGeoServerController@removeFromDashboard');
    //Routes for users
    Route::resource('users', 'UsersController');
    Route::post('users', 'UsersController@index');
    Route::get('adduser', 'UsersController@add');
    Route::post('createuser', 'UsersController@create');
    Route::get('users/edit/{id}', 'UsersController@edit');
    Route::post('users/edit/{id}', 'UsersController@update');
    Route::get('users/del/{id}', 'UsersController@removeUser');
});
