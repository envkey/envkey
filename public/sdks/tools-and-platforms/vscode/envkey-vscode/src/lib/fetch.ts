import * as path from "path";
import { fetch } from "envkey/loader";

export const envsByFsPath: Record<
  string,
  {
    cache?: Promise<Record<string, string>>;
    onChange?: () => void;
  }
> = {};

export const getEnv = async (
  fsPath: string
): Promise<Record<string, string>> => {
  if (envsByFsPath[fsPath]) {
    const cache = envsByFsPath[fsPath].cache;
    if (cache) {
      return cache;
    }
  } else {
    envsByFsPath[fsPath] = {};
  }

  const directory = path.dirname(fsPath);
  const cached = new Promise<Record<string, string>>((resolve) => {
    fetch(
      {
        memCache: true,
        cwd: directory,
        onChange: (updatedEnv) => {
          if (!envsByFsPath[fsPath]) {
            return;
          }
          envsByFsPath[fsPath].cache = Promise.resolve(updatedEnv);
          const onChange = envsByFsPath[fsPath].onChange;
          if (onChange) {
            onChange();
          }
        },
      },
      (err, env) => {
        if (err) {
          if (err.includes("ENVKEY missing")) {
            resolve({});
          } else {
            console.error(
              `EnvKey: error fetching vars for file ${fsPath}: ${err}`
            );
            resolve({});
          }
          return;
        }
        resolve(env);
      }
    );
  });

  envsByFsPath[fsPath] = {
    ...(envsByFsPath[fsPath] || {}),
    cache: cached,
  };

  return cached;
};
