export function prop<T, K extends keyof T>(key: K): (obj: T) => T[K]
export function prop<T, K extends keyof T>(key: K, obj: T): T[K]
export function prop<T, K extends keyof T>(
  key: K,
  obj?: T
): ((obj: T) => T[K]) | T[K] {
  const fn = (o: T) => o[key]
  return obj ? fn(obj) : fn
}
