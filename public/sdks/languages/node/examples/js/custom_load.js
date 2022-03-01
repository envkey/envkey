const load = require("envkey/loader").load;

load(function(){
  console.log("TEST_VAR:", process.env.TEST_VAR);
});
