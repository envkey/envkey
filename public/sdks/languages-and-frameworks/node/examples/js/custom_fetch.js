const fetch = require("envkey/loader").fetch;

fetch(function(err, env){
  console.log("TEST_VAR:", env.TEST_VAR);
});
