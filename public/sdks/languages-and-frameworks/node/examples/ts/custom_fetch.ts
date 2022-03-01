import { fetch } from "envkey/loader";

fetch((err, env) => {
  console.log("TEST_VAR:", env.TEST_VAR);
});
