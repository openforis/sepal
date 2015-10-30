<?php namespace Mohsen\Captcha;

use Config;
use Crypt;
use Hash;
use Session;
use Str;
use URL;

class Captcha {

  public static function getImage($count = null, $width = null, $height = null, $backgroundColor = null, $quality = null)
  {
    $count = isset($count) ? $count : 7;
    $width = isset($width) ? $width : 160;
    $height = isset($height) ? $height : 70;
    $backgroundColor = isset($backgroundColor) ? $backgroundColor : 'efefef';
    $quality = isset($quality) ? $quality : 50;

    if ($quality > 100 || $quality < 0) $quality = 50;

    $url = 'count='.(int)$count.'&width='.(int)$width.'&height='.(int)$height.'&backgroundcolor='.$backgroundColor.'&quality='.(int)$quality;
    $hashedUrl = Crypt::encrypt($url);

    return URL::to('/captcha/'.$hashedUrl);
  }

  public static function create($hashedUrl)
  {
    $url = Crypt::decrypt($hashedUrl);
    parse_str($url, $url);

    $captchaText = strtoupper(substr(Str::random(), 0, $url['count']));
    Session::put('captchaHash', Hash::make($captchaText));

    $image = imagecreate($url['width'], $url['height']);
    $background = imagecolorallocatealpha($image, hexdec(substr($url['backgroundcolor'], 0, 2)), hexdec(substr($url['backgroundcolor'], 2, 2)), hexdec(substr($url['backgroundcolor'], 4, 2)), 1);
    $textColor = imagecolorallocatealpha($image, 0, 0, 0, 1);
    $x = 5;
    $y = 50;
    $angle = 0;

    for($i = 0; $i < $url['count']; $i++) {
      $fontSize = mt_rand(15, 35);
      $text = substr($captchaText, $i, 1);
      imagettftext($image, $fontSize, $angle, $x, $y, $textColor, __DIR__.'/../../../public/fonts/impact.ttf', $text);

      $x = $x + 17 + mt_rand(1, 10);
      $y = mt_rand(40, 65);
      $angle = mt_rand(5, 10);
    }

    header('Cache-Control: no-cache, no-store, max-age=0, must-revalidate');
	header('Pragma: no-cache');
	header('Content-type: image/jpeg');
    imagejpeg($image, null, $url['quality']);
    imagedestroy($image);
  }

  public static function validate($value)
  {
    if(Hash::check(strtoupper($value), Session::get('captchaHash'))) {
      return true;
    }
    return false;
  }
}
