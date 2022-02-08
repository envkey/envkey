import dotenv from "dotenv";
import path from "path";
dotenv.config({
  path: path.resolve(__dirname, "../../../api/runtimes/express/.env"),
});
dotenv.config({
  path: path.resolve(__dirname, "../../../api/runtimes/express/.community.env"),
});
