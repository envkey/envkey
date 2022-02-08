import yargs from "yargs";
import fs from "fs";

const argv = yargs.argv,
  cmds = argv._;

for (let cmd of cmds) {
  const ts = `import { addCommand } from "../cmd";

addCommand((yargs) =>
  yargs.command(
    "${cmd}",
    "",
    (yargs) => yargs,
    async (argv) => {

      // need to manually exit process since yargs doesn't properly wait for async handlers
      process.exit();
    }
  )
);
`;

  const cmdLabel = cmd.split(/[:-]/).join("_"),
    path = `${__dirname}/src/commands/${cmdLabel}.ts`;

  console.log(`Generated ${cmd} at src/commands/${cmdLabel}.ts`);

  fs.writeFileSync(path, ts);

  const importStr = `import "./${cmdLabel}";`,
    indexPath = `${__dirname}/src/commands/index.ts`,
    index = fs.readFileSync(indexPath).toString();

  if (!index.includes(importStr)) {
    console.log(`Added ${cmd} to src/commands/index.ts`);
    const txt = [index, importStr].join("\n"),
      lines = txt.split("\n").filter((line) => line && line.trim()),
      sorted = lines.sort(),
      updated = sorted.join("\n");

    fs.writeFileSync(indexPath, updated);
  }
}
