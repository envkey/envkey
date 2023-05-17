<?php
require_once __DIR__ . '/../vendor/autoload.php'; // Include the Composer autoloader

  $lalaValue = getenv('LALA'); // Get the value of the LALA variable
  // Output the value to the webpage
  echo "The value of LALA is: $lalaValue";

?>
