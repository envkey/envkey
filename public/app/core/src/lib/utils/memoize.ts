import memoize from "memoizee";

let cacheNumItems = 10000;
let cacheMaxAge = 1000 * 60 * 10; // 10 minutes

type Memoizer = (...args: any[]) => any;

const stringify = (o: any) =>
  JSON.stringify(o, (k, v) => (v instanceof Set ? Array.from(v) : v));

export const configureMemoization = (numItems: number, maxAge: number) => {
  cacheNumItems = numItems;
  cacheMaxAge = maxAge;
};

export const memoizeShallowFirstDeepRest = <T extends Memoizer>(fn: T) =>
  memoize(fn, {
    max: cacheNumItems,
    maxAge: cacheMaxAge,
    normalizer: (args) => {
      let res = "";
      for (let i = 0; i < args.length; i++) {
        if (i == 0 && typeof args[i] == "object") {
          res += objectId(args[i]);
        } else {
          res += stringify(args[i]);
        }
      }
      return res;
    },
  });

export const memoizeShallowAll = <T extends Memoizer>(fn: T) =>
  memoize(fn, {
    max: cacheNumItems,
    maxAge: cacheMaxAge,
    normalizer: (args) => {
      let res = "";
      for (let i = 0; i < args.length; i++) {
        res +=
          typeof args[i] == "object" ? objectId(args[i]) : stringify(args[i]);
      }
      return res;
    },
  });

export const memoizeDeepAll = <T extends Memoizer>(fn: T) =>
  memoize(fn, {
    max: cacheNumItems,
    maxAge: cacheMaxAge,
    normalizer: (args) => {
      let res = "";
      for (let i = 0; i < args.length; i++) {
        res += stringify(args[i]);
      }
      return res;
    },
  });

export default memoizeShallowFirstDeepRest;

let currentId = 0;
const map = new WeakMap();

const objectId = (object: {}) => {
  if (!map.has(object)) {
    map.set(object, ++currentId);
  }

  return map.get(object);
};
