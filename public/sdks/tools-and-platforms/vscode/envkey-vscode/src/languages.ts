export type LanguageConfig = {
  autoCompleteRegex: RegExp;
  diagnosticRegex: RegExp;
  triggerCharacters: string[];
};

const jsTsConfig: LanguageConfig[] = [
  {
    autoCompleteRegex: /process\.env\./,
    diagnosticRegex: /process\.env\.(\w+?)(?:\W|$)/g,
    triggerCharacters: ["."],
  },
  {
    autoCompleteRegex: /process\.env\[['"]/,
    diagnosticRegex: /process\.env\[['"](\w+?)['"]/g,
    triggerCharacters: ['"', "'"],
  },
];

export const languages: Record<string, LanguageConfig[] | undefined> = {
  ada: [
    {
      autoCompleteRegex: /Ada\.Environment\.Get_Environment_Variable\("(\w+?)"/,
      diagnosticRegex: /Ada\.Environment\.Get_Environment_Variable\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  apex: [
    {
      autoCompleteRegex: /System\.getenv\('(\w+?)'\)/,
      diagnosticRegex: /System\.getenv\('(\w+?)'\)/g,
      triggerCharacters: ["'"],
    },
  ],
  applescript: [
    {
      autoCompleteRegex: /system attribute "/,
      diagnosticRegex: /system attribute "(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
  c: [
    {
      autoCompleteRegex: /getenv\("/,
      diagnosticRegex: /getenv\("(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
  clojure: [
    {
      autoCompleteRegex: /System\/getenv\ ['"]/,
      diagnosticRegex: /System\/getenv\ ['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  cpp: [
    {
      autoCompleteRegex: /std::getenv\("/,
      diagnosticRegex: /std::getenv\("(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
  crystal: [
    {
      autoCompleteRegex: /ENV\["/,
      diagnosticRegex: /ENV\["(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  csharp: [
    {
      autoCompleteRegex: /Environment\.GetEnvironmentVariable\(['"]/,
      diagnosticRegex: /Environment\.GetEnvironmentVariable\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  dart: [
    {
      autoCompleteRegex: /Platform\.environment\[['"]/,
      diagnosticRegex: /Platform\.environment\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  delphi: [
    {
      autoCompleteRegex: /GetEnvironmentVariable\('/,
      diagnosticRegex: /GetEnvironmentVariable\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
  ],
  dlang: [
    {
      autoCompleteRegex: /getEnv\("/,
      diagnosticRegex: /getEnv\("(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
  dockercompose: [
    {
      autoCompleteRegex: /environment:\n\s*-\s*(\w+?):/,
      diagnosticRegex: /environment:\n\s*-\s*(\w+?):/g,
      triggerCharacters: [":", " "],
    },
  ],
  dockerfile: [
    {
      autoCompleteRegex: /ENV\s+(\w+)/,
      diagnosticRegex: /ENV\s+(\w+)/g,
      triggerCharacters: [" "],
    },
  ],
  elixir: [
    {
      autoCompleteRegex: /System\.get_env\(['"]/,
      diagnosticRegex: /System\.get_env\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  erlang: [
    {
      autoCompleteRegex: /os:getenv\(['"]/,
      diagnosticRegex: /os:getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  fsharp: [
    {
      autoCompleteRegex: /System.Environment.GetEnvironmentVariable\(['"]/,
      diagnosticRegex:
        /System.Environment.GetEnvironmentVariable\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  go: [
    {
      autoCompleteRegex: /os\.Getenv\("/,
      diagnosticRegex: /os\.Getenv\("(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
  groovy: [
    {
      autoCompleteRegex: /System\.getenv\(['"]/,
      diagnosticRegex: /System\.getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  haskell: [
    {
      autoCompleteRegex: /getEnv "/,
      diagnosticRegex: /getEnv "(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
  java: [
    {
      autoCompleteRegex: /System\.getenv\(['"]/,
      diagnosticRegex: /System\.getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  javascript: jsTsConfig,
  julia: [
    {
      autoCompleteRegex: /ENV\["/,
      diagnosticRegex: /ENV\["(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  kotlin: [
    {
      autoCompleteRegex: /System\.getenv\(['"]/,
      diagnosticRegex: /System\.getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  lua: [
    {
      autoCompleteRegex: /os\.getenv\(['"]/,
      diagnosticRegex: /os\.getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  matlab: [
    {
      autoCompleteRegex: /getenv\('/,
      diagnosticRegex: /getenv\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
  ],
  nim: [
    {
      autoCompleteRegex: /os\.getEnv\("/,
      diagnosticRegex: /os\.getEnv\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  ocaml: [
    {
      autoCompleteRegex: /Sys\.getenv "/,
      diagnosticRegex: /Sys\.getenv "(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  pascal: [
    {
      autoCompleteRegex: /GetEnv\('/,
      diagnosticRegex: /GetEnv\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
  ],
  perl: [
    {
      autoCompleteRegex: /\$ENV\{['"]/,
      diagnosticRegex: /\$ENV\{['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  php: [
    {
      autoCompleteRegex: /getenv\(['"]/,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  powershell: [
    {
      autoCompleteRegex: /\$env:/,
      diagnosticRegex: /\$env:(\w+?)(?:\W|$)/g,
      triggerCharacters: [":"],
    },
  ],
  prolog: [
    {
      autoCompleteRegex: /getenv\('/,
      diagnosticRegex: /getenv\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
  ],
  python: [
    {
      autoCompleteRegex: /os\.environ\[['"]/,
      diagnosticRegex: /os\.environ\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  r: [
    {
      autoCompleteRegex: /Sys\.getenv\(['"]/,
      diagnosticRegex: /Sys\.getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  racket: [
    {
      autoCompleteRegex: /getenv "/,
      diagnosticRegex: /getenv "(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  reasonml: [
    {
      autoCompleteRegex: /Js.Dict.get\(\s*Js.process##env,\s*"/,
      diagnosticRegex: /Js.Dict.get\(\s*Js.process##env,\s*"(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  ruby: [
    {
      autoCompleteRegex: /ENV\[['"]/,
      diagnosticRegex: /ENV\[\s*['"](\w+?)['"]/g,
      triggerCharacters: [`'`, `"`],
    },
  ],
  rust: [
    {
      autoCompleteRegex: /env::var\(['"]/,
      diagnosticRegex: /env::var\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  sas: [
    {
      autoCompleteRegex: /%sysget\('(\w+?)'\)/,
      diagnosticRegex: /%sysget\('(\w+?)'\)/g,
      triggerCharacters: ["'"],
    },
  ],
  scala: [
    {
      autoCompleteRegex: /sys\.env\(['"]/,
      diagnosticRegex: /sys\.env\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  scheme: [
    {
      autoCompleteRegex: /(getenv\s*)"/,
      diagnosticRegex: /(getenv\s*)"(\w+)"/g,
      triggerCharacters: ['"'],
    },
  ],
  shellscript: [
    {
      autoCompleteRegex: /\$/,
      diagnosticRegex: /\$(\w+)/g,
      triggerCharacters: ["$"],
    },
    {
      autoCompleteRegex: /\$\{/,
      diagnosticRegex: /\$\{(\w+)\}/g,
      triggerCharacters: ["{"],
    },
  ],
  swift: [
    {
      autoCompleteRegex: /ProcessInfo\.processInfo\.environment\[['"]/,
      diagnosticRegex: /ProcessInfo\.processInfo\.environment\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  typescript: jsTsConfig,
  vba: [
    {
      autoCompleteRegex: /Environ\("/,
      diagnosticRegex: /Environ\("(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
  vbnet: [
    {
      autoCompleteRegex: /Environment\.GetEnvironmentVariable\(['"]/,
      diagnosticRegex: /Environment\.GetEnvironmentVariable\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  zig: [
    {
      autoCompleteRegex: /std\.os\.getEnv\("/,
      diagnosticRegex: /std\.os\.getEnv\("(\w+?)/g,
      triggerCharacters: ['"'],
    },
  ],
};
