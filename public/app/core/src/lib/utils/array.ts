export const shuffle = <T>(array: T[]) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const filterJoin = (
  sep: string,
  ...args: string[] | (string | undefined)[]
) => {
  let res = "";
  for (let s of args) {
    if (s) {
      if (res) {
        res += sep;
      }
      res += s;
    }
  }
  return res;
};

export const indexBy = <T>(fn: (el: T) => string, a: T[]) => {
  const idx: Record<string, T> = {};
  for (let el of a) {
    idx[fn(el)] = el;
  }
  return idx;
};

export const groupBy = <T>(fn: (el: T) => string, a: T[]) => {
  const idx: Record<string, T[]> = {};
  for (let el of a) {
    const id = fn(el);
    if (idx[id]) {
      idx[id].push(el);
    } else {
      idx[id] = [el];
    }
  }
  return idx;
};
