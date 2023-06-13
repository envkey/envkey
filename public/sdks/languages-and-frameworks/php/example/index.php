<?php
  require_once __DIR__ . '/vendor/autoload.php'; // Include the Composer autoloader

  $databaseUrl = getenv('DATABASE_URL'); 

  echo "The value of DATABASE_URL is: $databaseUrl";

?>