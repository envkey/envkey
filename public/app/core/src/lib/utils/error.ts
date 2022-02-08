export class UnreachableError extends Error {
  constructor(val: never) {
    super(`Unreachable case: ${val}`);
  }
}
