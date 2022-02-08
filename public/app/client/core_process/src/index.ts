import argv from "./argv";
import { start } from "./server";

const port = argv.port ? parseInt(argv.port) : 19047,
  wsport = argv["websocket-port"] ? parseInt(argv["websocket-port"]) : 19048;

start(port, wsport);
