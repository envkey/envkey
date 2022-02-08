import * as R from "ramda";
export * from "./pick";
export * from "./prop";
import { log } from "./logger";

export const flattenObj = (obj: object): { [k: string]: any } => {
    const go = (obj_: { [k: string]: any } | { [k: number]: any }): any[] =>
      R.chain(([k, v]) => {
        if (typeof v == "object") {
          return R.map(([k_, v_]) => [`${k}.${k_}`, v_], go(v));
        } else {
          return [[k, v]];
        }
      }, R.toPairs(obj_));

    return R.fromPairs(go(obj));
  },
  /*
   *  Recursively transforms a given set of keys within an object with a given transformer function no matter where those keys appear in an object's hierarchy.
   *  Handles nested objects and nested arrays of objects, but not nested multi-dimensional arrays.
   */
  transformKeysDeep = (
    obj: { [k: string]: any },
    keys: string[],
    transformer: (v: any) => any
  ): { [k: string]: any } => {
    const pairs = R.toPairs(obj) as [string, any][],
      transformed = pairs.map(([k, v]) => {
        if (keys.indexOf(k) > -1) {
          return [k, transformer(v)];
        } else if (v && typeof v === "object" && !Array.isArray(v)) {
          return [k, transformKeysDeep(v, keys, transformer)];
        } else if (Array.isArray(v)) {
          return [
            k,
            v.map((el) => {
              if (el && typeof el === "object" && !Array.isArray(el)) {
                return transformKeysDeep(el, keys, transformer);
              }
              return el;
            }),
          ];
        }
        return [k, v];
      }) as [string, any][];

    return R.fromPairs(transformed);
  },
  allKeysDeep = (obj: { [k: string]: any }): string[] => {
    let keys = new Set<string>([]);

    for (let k in obj) {
      keys.add(k);
      if (obj[k] && typeof obj[k] == "object") {
        if (Array.isArray(obj[k])) {
          for (let el of R.flatten(obj[k])) {
            if (el && typeof el == "object") {
              keys = new Set(Array.from(keys).concat(allKeysDeep(el)));
            }
          }
        } else {
          keys = new Set(Array.from(keys).concat(allKeysDeep(obj[k])));
        }
      }
    }

    return Array.from(keys);
  },
  stripUndefinedRecursive = <T = any>(obj: T) => {
    const clone = R.clone(obj),
      toDelete = [];

    for (let k in clone) {
      const v: any = clone[k];
      if (typeof v === "undefined") toDelete.push(k);
      const isObj =
        typeof v == "object" && v instanceof Object && !(v instanceof Array);
      if (isObj) {
        clone[k] = stripNullsRecursive(v);
      }
    }
    for (let k of toDelete) {
      delete clone[k];
    }

    return clone;
  },
  stripNullsRecursive = <T = any>(obj: T) => {
    const clone = R.clone(obj),
      toDelete = [];

    for (let k in clone) {
      const v: any = clone[k];
      if (v === null || typeof v === "undefined") toDelete.push(k);
      const isObj =
        typeof v == "object" && v instanceof Object && !(v instanceof Array);
      if (isObj) {
        clone[k] = stripNullsRecursive(v);
      }
    }
    for (let k of toDelete) {
      delete clone[k];
    }

    return clone;
  },
  stripEmptyRecursive = <T = any>(obj: T) => {
    const clone = R.clone(obj),
      toDelete = [];

    for (let k in clone) {
      const v: any = clone[k];
      if (typeof v == "object" && v instanceof Object) {
        if (R.isEmpty(v)) {
          toDelete.push(k);
        } else {
          clone[k] = stripEmptyRecursive(v);
          if (R.isEmpty(clone[k])) {
            toDelete.push(k);
          }
        }
      }
    }
    for (let k of toDelete) {
      delete clone[k];
    }

    return clone;
  },
  objectPaths = (obj: { [k: string]: any }): string[][] => {
    let paths: string[][] = [];

    for (let k in obj) {
      if (k === "type") {
        continue;
      }

      let v = obj[k],
        path = [k];

      if (typeof v == "object" && !Array.isArray(v)) {
        const nestedPaths = objectPaths(v);
        for (let nestedPath of nestedPaths) {
          paths.push([k, ...nestedPath]);
        }
      } else {
        paths.push(path);
      }
    }

    return paths;
  },
  objectDifference = <T extends { [k: string]: any }>(obj1: T, obj2: T): T => {
    const paths1 = objectPaths(obj1),
      paths2 = objectPaths(obj2),
      pathsDifference = R.difference(
        paths1.map((path) => JSON.stringify(path)),
        paths2.map((path) => JSON.stringify(path))
      ).map((json) => JSON.parse(json)) as string[][];

    return pathsDifference.reduce<T>(
      (obj, path) => R.assocPath(path, R.path(path, obj1), obj),
      {} as T
    );
  },
  objectIntersection = <T extends { [k: string]: any }>(
    obj1: T,
    obj2: T
  ): T => {
    const paths1 = objectPaths(obj1),
      paths2 = objectPaths(obj2),
      pathsIntersection = R.intersection(
        paths1.map((path) => JSON.stringify(path)),
        paths2.map((path) => JSON.stringify(path))
      ).map((json) => JSON.parse(json)) as string[][];

    return pathsIntersection.reduce<T>(
      (obj, path) => R.assocPath(path, R.path(path, obj1), obj),
      {} as T
    );
  },
  setToObject = <T extends string>(s: Set<T>) =>
    Array.from(s).reduce(
      (agg, k) => ({ ...agg, [k]: true }),
      {} as { [key in T]: true }
    );
