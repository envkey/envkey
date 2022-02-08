export function pick<T, K extends keyof T = keyof T>(
  keys: K[]
): (obj: T) => Pick<T, K>;
export function pick<T, K extends keyof T = keyof T>(
  keys: K[],
  obj: T
): Pick<T, K>;
export function pick<T, K extends keyof T = keyof T>(
  keys: K[],
  obj?: T
): ((obj: T) => Pick<T, K>) | Pick<T, K> {
  const fn = (o: T) => {
    const ret: any = {};
    keys.forEach((key) => {
      ret[key] = o[key];
    });
    return ret;
  };

  return obj ? fn(obj) : fn;
}

export function pickDefined<T, K extends keyof T = keyof T>(
  keys: K[]
): (obj: T) => Pick<T, K>;
export function pickDefined<T, K extends keyof T = keyof T>(
  keys: K[],
  obj: T
): Pick<T, K>;
export function pickDefined<T, K extends keyof T = keyof T>(
  keys: K[],
  obj?: T
): ((obj: T) => Pick<T, K>) | Pick<T, K> {
  const fn = (o: T) => {
    const ret: any = {};
    keys.forEach((key) => {
      if (typeof o[key] !== "undefined") {
        ret[key] = o[key];
      }
    });
    return ret;
  };

  return obj ? fn(obj) : fn;
}
