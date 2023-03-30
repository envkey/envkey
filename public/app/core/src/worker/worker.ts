import cryptoWorkers from "../lib/crypto/worker";
import { worker } from "workerpool";
import { clearOrphanedBlobPaths } from "../lib/client";

const fns: Record<string, (...params: any[]) => any> = {};

const addModule = (m: any) => {
  for (let k in m) {
    if (typeof m[k] == "function") {
      const fn = m[k] as (...params: any[]) => any;
      fns[k] = fn;
    }
  }
};

addModule({ clearOrphanedBlobPaths });

worker({
  ...cryptoWorkers,
  ...fns,
});
