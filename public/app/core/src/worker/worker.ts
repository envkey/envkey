import cryptoWorkers from "../lib/crypto/worker";
import { worker } from "workerpool";
import * as g from "../lib/graph";
import * as blob from "../lib/blob";
import * as client from "../lib/client";
import * as parse from "../lib/parse";

const fns: Record<string, (...params: any[]) => any> = {};

const addModule = (m: any) => {
  for (let k in m) {
    if (typeof m[k] == "function") {
      const fn = m[k] as (...params: any[]) => any;
      fns[k] = fn;
    } else {
      addModule((g as any)[k]);
    }
  }
};

addModule(g);
addModule(blob);
addModule(client);
addModule(parse);

worker({
  ...cryptoWorkers,
  ...fns,
});
