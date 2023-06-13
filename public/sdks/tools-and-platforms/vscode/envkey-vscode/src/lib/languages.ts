export type RegexConfig = {
  autoCompleteRegex: RegExp;
  diagnosticRegex: RegExp;
  triggerCharacters: string[];
};

const jsTsConfig: RegexConfig[] = [
  {
    autoCompleteRegex: /process\.env\./g,
    diagnosticRegex: /process\.env\.(\w+?)(?:\W|$)/g,
    triggerCharacters: ["."],
  },
  {
    autoCompleteRegex: /process\.env\[['"]/g,
    diagnosticRegex: /process\.env\[['"](\w+?)['"]/g,
    triggerCharacters: ['"', "'"],
  },
];

const shellscriptConfig: RegexConfig[] = [
  {
    autoCompleteRegex: /\$/g,
    diagnosticRegex: /\$(\w+)/g,
    triggerCharacters: ["$"],
  },
  {
    autoCompleteRegex: /\$\{/g,
    diagnosticRegex: /\$\{(\w+)\}/g,
    triggerCharacters: ["{"],
  },
];

export const regexes: Record<string, RegexConfig[] | undefined> = {
  ada: [
    {
      autoCompleteRegex: /Get_Environment_Variable\("(\w+?)"/g,
      diagnosticRegex: /Get_Environment_Variable\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  applescript: [
    {
      autoCompleteRegex: /system attribute "/g,
      diagnosticRegex: /system attribute "(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  c: [
    {
      autoCompleteRegex: /getenv\("/g,
      diagnosticRegex: /getenv\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  clojure: [
    {
      autoCompleteRegex: /getenv\ ['"]/g,
      diagnosticRegex: /getenv\ ['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  commonlisp: [
    {
      autoCompleteRegex: /getenv\ ['"]/gi,
      diagnosticRegex: /getenv\ ['"](\w+?)['"]/gi,
      triggerCharacters: ['"', "'"],
    },
    {
      autoCompleteRegex: /environment-variable\ ['"]/gi,
      diagnosticRegex: /environment-variable\ ['"](\w+?)['"]/gi,
      triggerCharacters: ['"', "'"],
    },
  ],
  cpp: [
    {
      autoCompleteRegex: /getenv\("/g,
      diagnosticRegex: /getenv\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  crystal: [
    {
      autoCompleteRegex: /ENV\["/g,
      diagnosticRegex: /ENV\["(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  csharp: [
    {
      autoCompleteRegex: /GetEnvironmentVariable\(['"]/g,
      diagnosticRegex: /GetEnvironmentVariable\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  dart: [
    {
      autoCompleteRegex: /environment\[['"]/g,
      diagnosticRegex: /environment\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
    {
      autoCompleteRegex: /fromEnvironment\(['"]/g,
      diagnosticRegex: /fromEnvironment\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  delphi: [
    {
      autoCompleteRegex: /GetEnvironmentVariable\('/g,
      diagnosticRegex: /GetEnvironmentVariable\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
  ],
  dlang: [
    {
      autoCompleteRegex: /getenv\("/g,
      diagnosticRegex: /getenv\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
    {
      autoCompleteRegex: /environment\.get\("/g,
      diagnosticRegex: /environment\.get\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  dockercompose: shellscriptConfig,
  dockerfile: shellscriptConfig,
  elixir: [
    {
      autoCompleteRegex: /get_env\(['"]/g,
      diagnosticRegex: /get_env\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  erlang: [
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  fortran: [
    {
      autoCompleteRegex: /get_environment_variable\(['"]/gi,
      diagnosticRegex: /get_environment_variable\(['"](\w+?)['"]/gi,
      triggerCharacters: ['"', "'"],
    },
  ],
  fsharp: [
    {
      autoCompleteRegex: /GetEnvironmentVariable\(['"]/g,
      diagnosticRegex: /GetEnvironmentVariable\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  go: [
    {
      autoCompleteRegex: /Getenv\("/g,
      diagnosticRegex: /Getenv\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  groovy: [
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  haskell: [
    {
      autoCompleteRegex: /getEnv "/g,
      diagnosticRegex: /getEnv "(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  java: [
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  javascript: jsTsConfig,
  julia: [
    {
      autoCompleteRegex: /ENV\["/g,
      diagnosticRegex: /ENV\["(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  kotlin: [
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  lua: [
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  makefile: [
    {
      autoCompleteRegex: /\$\(/g,
      diagnosticRegex: /\$\((\w+)?\)/g,
      triggerCharacters: ["("],
    },
    {
      autoCompleteRegex: /\$\{/g,
      diagnosticRegex: /\$\{(\w+)?\}/g,
      triggerCharacters: ["{"],
    },
  ],
  nim: [
    {
      autoCompleteRegex: /getEnv\("/g,
      diagnosticRegex: /getEnv\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  ocaml: [
    {
      autoCompleteRegex: /getenv "/g,
      diagnosticRegex: /getenv "(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  pascal: [
    {
      autoCompleteRegex: /GetEnv\('/g,
      diagnosticRegex: /GetEnv\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
    {
      autoCompleteRegex: /GetEnvironmentVariable\('/g,
      diagnosticRegex: /GetEnvironmentVariable\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
  ],
  perl: [
    {
      autoCompleteRegex: /\$ENV\{['"]/g,
      diagnosticRegex: /\$ENV\{['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  php: [
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
    {
      autoCompleteRegex: /\$_ENV\[['"]/g,
      diagnosticRegex: /\$_ENV\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
    {
      autoCompleteRegex: /\$_SERVER\[['"]/g,
      diagnosticRegex: /\$_SERVER\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  powershell: [
    {
      autoCompleteRegex: /\$env:/gi,
      diagnosticRegex: /\$env:(\w+?)(?:\W|$)/gi,
      triggerCharacters: [":"],
    },
  ],
  prolog: [
    {
      autoCompleteRegex: /getenv\('/g,
      diagnosticRegex: /getenv\('(\w+?)'/g,
      triggerCharacters: ["'"],
    },
  ],
  python: [
    {
      autoCompleteRegex: /environ\[['"]/g,
      diagnosticRegex: /environ\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
    {
      autoCompleteRegex: /environ\.get\(['"]/g,
      diagnosticRegex: /environ\.get\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  r: [
    {
      autoCompleteRegex: /getenv\(['"]/g,
      diagnosticRegex: /getenv\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  racket: [
    {
      autoCompleteRegex: /getenv "/g,
      diagnosticRegex: /getenv "(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
  ruby: [
    {
      autoCompleteRegex: /ENV\[['"]/g,
      diagnosticRegex: /ENV\[\s*['"](\w+?)['"]/g,
      triggerCharacters: [`'`, `"`],
    },
    {
      autoCompleteRegex: /ENV\.fetch\(['"]/g,
      diagnosticRegex: /ENV\.fetch\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  rust: [
    {
      autoCompleteRegex: /env::var\(['"]/g,
      diagnosticRegex: /env::var\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
    {
      autoCompleteRegex: /env::var_os\(['"]/g,
      diagnosticRegex: /env::var_os\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  sas: [
    {
      autoCompleteRegex: /%sysget\('(\w+?)'\)/g,
      diagnosticRegex: /%sysget\('(\w+?)'\)/g,
      triggerCharacters: ["'"],
    },
  ],
  scala: [
    {
      autoCompleteRegex: /sys\.env\(['"]/g,
      diagnosticRegex: /sys\.env\(['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  scheme: [
    {
      autoCompleteRegex: /getenv\s*"/g,
      diagnosticRegex: /getenv\s*"(\w+)"/g,
      triggerCharacters: ['"'],
    },
    {
      autoCompleteRegex: /get-environment-variable\s*"/g,
      diagnosticRegex: /get-environment-variable\s*"(\w+)"/g,
      triggerCharacters: ['"'],
    },
  ],
  shellscript: shellscriptConfig,
  swift: [
    {
      autoCompleteRegex: /ProcessInfo\.processInfo\.environment\[['"]/g,
      diagnosticRegex: /ProcessInfo\.processInfo\.environment\[['"](\w+?)['"]/g,
      triggerCharacters: ['"', "'"],
    },
  ],
  typescript: jsTsConfig,
  vba: [
    {
      autoCompleteRegex: /Environ\("/gi,
      diagnosticRegex: /Environ\("(\w+?)"/gi,
      triggerCharacters: ['"'],
    },
  ],
  vbnet: [
    {
      autoCompleteRegex: /GetEnvironmentVariable\(['"]/gi,
      diagnosticRegex: /GetEnvironmentVariable\(['"](\w+?)['"]/gi,
      triggerCharacters: ['"', "'"],
    },
  ],
  zig: [
    {
      autoCompleteRegex: /getenv\("/g,
      diagnosticRegex: /getenv\("(\w+?)"/g,
      triggerCharacters: ['"'],
    },
  ],
};
