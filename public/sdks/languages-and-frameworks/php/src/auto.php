<?php  
  if (!getenv('ENVKEY_DISABLE_AUTOLOAD')) {    
    include_once('Loader.php');
    Envkey\Loader::load();
  }