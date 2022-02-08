import * as R from "ramda";
import yaml from "js-yaml";

export type Format = "json" | "yaml" | "env" | "json-pretty";

type Parser = (
  txt: string,
  formats?: Format[]
) => { [k: string]: string } | null;
type Dumper = (obj: { [k: string]: string }, format?: Format) => string;

const dotenv = (src: string) => {
    const obj: { [k: string]: string } = {};

    // convert Buffers before splitting into lines and processing
    src.split("\n").forEach(function (line: string) {
      // matching "KEY' and 'VAL' in 'KEY=VAL'
      const keyValueArr = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
      // matched?
      if (keyValueArr != null) {
        const key = keyValueArr[1];

        // default undefined or missing values to empty string
        let value = keyValueArr[2] ? keyValueArr[2] : "";

        // expand newlines in quoted values
        const len = value ? value.length : 0;
        if (
          len > 0 &&
          value.charAt(0) === '"' &&
          value.charAt(len - 1) === '"'
        ) {
          value = value.replace(/\\n/gm, "\n");
        }

        // remove any surrounding quotes and extra spaces
        value = value.replace(/(^['"]|['"]$)/g, "").trim();

        obj[key] = value;
      }
    });

    return obj;
  },
  stringifyValues = (obj: { [k: string]: any }): { [k: string]: any } =>
    R.map(
      (v) => (v && typeof v != "string" ? JSON.stringify(v) : v),
      obj as any
    );

export const parseJson: Parser = (txt) => {
    let parsedJson;
    if (txt.startsWith("{") && txt.endsWith("}")) {
      parsedJson = null;
      try {
        parsedJson = JSON.parse(txt);
      } catch (e) {}
      if (parsedJson) return stringifyValues(parsedJson);
    }
    return null;
  },
  parseYaml: Parser = (txt) => {
    let parsedYaml;
    try {
      parsedYaml = yaml.safeLoad(txt, { schema: yaml.FAILSAFE_SCHEMA });
    } catch (e) {}
    if (parsedYaml && typeof parsedYaml == "object" && !R.isEmpty(parsedYaml)) {
      return stringifyValues(parsedYaml);
    }
    return null;
  },
  parseDotenv: Parser = (txt) => {
    let parsedDotenv;
    try {
      parsedDotenv = dotenv(txt);
    } catch (e) {}
    if (parsedDotenv && !R.isEmpty(parsedDotenv)) return parsedDotenv;
    return null;
  },
  parseMultiFormat: Parser = (txt, formats = ["json", "yaml", "env"]) => {
    if (formats.includes("json")) {
      const parsedJson = parseJson(txt);
      if (parsedJson) return parsedJson;
    }

    if (formats.includes("yaml")) {
      const parsedYaml = parseYaml(txt);
      if (parsedYaml) return parsedYaml;
    }

    if (formats.includes("env")) {
      const parsedDotenv = parseDotenv(txt);
      if (parsedDotenv) return parsedDotenv;
    }

    return null;
  },
  toYaml: Dumper = (obj) =>
    yaml.safeDump(JSON.parse(JSON.stringify(obj)), {
      schema: yaml.FAILSAFE_SCHEMA,
    }),
  toDotEnv: Dumper = (obj) => {
    let s = "";
    for (let k in obj) {
      if (!obj[k] && obj[k] != "") continue;

      if (s) {
        s += "\n";
      }
      s += `${k}=`;
      if (obj[k] === "") {
        s += "";
      } else {
        s += `'${obj[k].replace("'", "\\'")}'`;
      }
    }
    return s;
  },
  rawEnvToTxt: Dumper = (rawEnv, format) => {
    let txt;
    if (format == "json") {
      txt = JSON.stringify(rawEnv);
    } else if (format == "json-pretty") {
      txt = JSON.stringify(rawEnv, null, 2);
    } else if (format == "yaml") {
      txt = toYaml(rawEnv);
    } else if (format == "env") {
      txt = toDotEnv(rawEnv);
    } else {
      throw new Error("unsupported format");
    }
    return txt;
  };
