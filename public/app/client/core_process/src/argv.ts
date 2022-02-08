import yargsParser from "yargs-parser";

const parsed = yargsParser(process.argv.slice(2));

const params = <const>{
  port: parsed.port || parsed.p || undefined,
  "websocket-port": parsed["websocket-port"] || parsed.wsp || undefined,
  verbose: Boolean(parsed.verbose || parsed.v),
};

export default params;

