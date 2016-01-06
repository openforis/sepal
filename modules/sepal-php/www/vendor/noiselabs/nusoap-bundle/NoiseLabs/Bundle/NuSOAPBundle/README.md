NoiselabsNuSOAP
===============

[@php]:     http://php.net/                 "PHP: Hypertext Preprocessor"
[@nusoap]:  http://nusoap.sourceforge.net/  "NuSOAP - SOAP Toolkit for PHP"
[@symfony]: http://www.symfony.com/         "High Performance PHP Framework for Web Development"

[Symfony2][@symfony] bundle for [NuSOAP - SOAP Toolkit for PHP][@nusoap].

Requirements
------------

* [PHP][@php] 5.3.3 and up.
* [Symfony 2][@symfony]

Installation (Composer)
-----------------------

### 0. Install Composer

If you don't have Composer yet, download it following the instructions on
http://getcomposer.org/ or just run the following command:

``` bash
curl -s http://getcomposer.org/installer | php
```

### 1. Add the noiselabs/nusoap-bundle package and the nusoap repository in your composer.json

```js
{
    "require": {
        "noiselabs/nusoap-bundle": "dev-master"
    },
    "repositories": [
        {
            "type": "package",
            "package": {
                "name": "nusphere/nusoap",
                "version": "0.9.5",
                "dist": {
                    "url": "http://downloads.sourceforge.net/project/nusoap/nusoap/0.9.5/nusoap-0.9.5.zip",
                    "type": "zip"
                },
                "autoload": {
                    "classmap": ["lib/"]
                }
            }
        }
    ],
}
```
Now tell composer to download the bundle by running the command:

```bash
$ php composer.phar update noiselabs/nusoap-bundle
```

Composer will install the bundle to your project's `vendor/noiselabs` directory.

### 2. Enable the bundle

Enable the bundle in the kernel:

```php
<?php
// app/AppKernel.php

public function registerBundles()
{
    $bundles = array(
        // ...
        new NoiseLabs\Bundle\NuSOAPBundle\NoiseLabsNuSOAPBundle(),
    );
}
```

Usage
-----

```php

$client = new \nusoap_client('http://example.com/url/to/some/valid.wsdl', true);

$response = $client->call('someSOAPMethod', array('param1'=>'foo', 'param2'=>'bar'));
```


[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/noiselabs/noiselabsnusoapbundle/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

