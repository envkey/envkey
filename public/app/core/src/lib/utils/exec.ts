import child_process = require("child_process");
// could not use util.promisify because of stdout and stderr
export async function exec(
  command: string,
  options: object = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    child_process.exec(command, options, (err, stdout, stderr) => {
      if (err) {
        console.log(stderr);
        return reject(err);
      }
      resolve(stdout.trim());
    });
  });
}

export function escapeShellUnixLike(arg: string) {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function escapeShellWindows(arg: string) {
  return `'${arg.replace(/'/g, `''`)}'`;
}
