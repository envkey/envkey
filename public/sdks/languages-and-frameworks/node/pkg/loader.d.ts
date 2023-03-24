// Note that in most cases, you won't need the `load` or `fetch` functions defined below. A simple `import "envkey"` or `require("envkey")` will load your environment and set the variables on `process.env`.

// `load` and `fetch` are defined in case more control is required

export type Options = {
  permitted?: string[];
  shouldCache?: boolean;
  dotEnvFile?: string;
};

export type Callback = (error: string, env: Record<string, string>) => void;

// `load` loads environment, sets variables on `process.env` and optionally accepts a callback that is called with an error (if any) and the environment as json (if no error)
export function load(opts: Options, callback?: Callback): void;
export function load(callback?: Callback): void;

// `fetch` is just like `load` except it doesn't set anything on `process.env`
export function fetch(opts: Options, callback?: Callback): void;
export function fetch(callback?: Callback): void;
