import { load } from "envkey/loader";

load(() => {
  console.log("TEST_VAR:", process.env.TEST_VAR);
});
