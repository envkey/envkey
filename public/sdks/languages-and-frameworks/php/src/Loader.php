<?php
namespace Envkey;

include_once('Fetcher.php');

class Loader {
  private static function throwKeyError() {
    $err = "ENVKEY invalid. Couldn't load vars.";
    throw new \Exception($err);
  }

  public static function load() {    
    try {
      $res = Fetcher::fetch();

      if (trim($res) === "") {
        self::throwKeyError();
      }

      $json = json_decode($res, true);

      if (!$json) {
        self::throwKeyError();
      }

      foreach ($json as $k => $v) {
        if (!getenv($k) && getenv($k) !== '') {
          putenv("{$k}={$v}");
        }
      }
    } catch (\Exception $e) {
      $error_msg = $e->getMessage();

      $err = str_replace("echo 'error: ", '', $error_msg);
      $err = str_replace('; false', '', $err);
      $err = str_replace('error:', '', $err);

      error_log($err);
      throw new \Exception($err);
    }
  }
}
?>