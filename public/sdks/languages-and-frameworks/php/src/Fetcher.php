<?php
namespace Envkey;

include_once('constants.php');

class Fetcher {
  private static function libExtension(){
    if (self::libPlatformPart() == 'windows'){
      return '.exe';
    } else {
      return '';
    }
  }

  private static function libFileName(){  
    return 'envkey-source'.self::libExtension();
  }

  private static function libArchPart(){
    if(PHP_INT_MAX == 2147483647) {
      return '386';
    } elseif (stristr(PHP_OS, 'DARWIN') && stripos(php_uname('m'), 'arm') !== false) {
      return 'arm64';
    } else {
      return 'amd64';
    }
  }

  private static function libPlatformPart(){
    if (stristr(PHP_OS, 'DARWIN')){
      return 'darwin';
    } elseif (stristr(PHP_OS, 'WIN')){
      return 'windows';
    } elseif (stristr(PHP_OS, 'BSD')){
      return 'freebsd';
    } else {
      return 'linux';
    }
  }

  private static function libDir(){
    return join('_', array('envkey-source', ENVKEY_SOURCE_VERSION, self::libPlatformPart(), self::libArchPart()));
  }

  private static function libPath(){
    $root = realpath(dirname(__dir__));
    return $root.DIRECTORY_SEPARATOR.'ext'.DIRECTORY_SEPARATOR.self::libDir().DIRECTORY_SEPARATOR.self::libFileName();
  }

  public static function fetch(){
    if (self::libArchPart() == "386"){
      throw new Exception("envkey-php only supports 64-bit systems.");
    }

    $composerJsonPath = __DIR__ . '/../composer.json'; // Path to the composer.json file
    $composerJson = file_get_contents($composerJsonPath); // Read the content of the file
    $composerData = json_decode($composerJson, true); // Decode the JSON into an associative array
    $version = $composerData['version']; // Access the 'version' property

    // Check if ENVKEY is available in $_SERVER or $_ENV and set it as an environment variable
    // ensures it gets passed through to envkey-source call
    if (isset($_SERVER['ENVKEY'])) {
      putenv("ENVKEY={$_SERVER['ENVKEY']}");
    } elseif (isset($_ENV['ENVKEY'])) {
      putenv("ENVKEY={$_ENV['ENVKEY']}");
    }

    $cmd = self::libPath().' --json --mem-cache --client-name envkey-php --client-version '.$version;
    $res = rtrim(shell_exec($cmd));

    return $res;
  }
}