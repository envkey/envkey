export type ProgramConfig = {
  dockerizable: boolean;
  program: string;
  ext?: string;
  fileName?: string;
  path?: string;
  otherFiles?: Record<string, string>;
  dockerfile?: string;
};

export const ENV_VAR_NAME = "FIRST_NAME";

export const programs: Record<string, ProgramConfig[]> = {
  ada: [
    {
      dockerizable: false,
      program: `with Ada.Text_IO; use Ada.Text_IO;
with Ada.Environment; use Ada.Environment;

procedure Hello is
   Name : String := Get_Environment_Variable("${ENV_VAR_NAME}");
begin
   Put_Line("Hello, " & Name);
end Hello;
`,
      ext: "adb",
    },
  ],

  applescript: [
    {
      dockerizable: false,
      program: `set name to system attribute "${ENV_VAR_NAME}"
display dialog "Hello, " & name
`,
      ext: "applescript",
    },
  ],

  c: [
    {
      dockerizable: true,
      program: `#include <stdio.h>
#include <stdlib.h>

int main() {
   char* name = getenv("${ENV_VAR_NAME}");
   printf("Hello, %s\\n", name);
   return 0;
}`,
      ext: "c",
    },
  ],

  clojure: [
    {
      dockerizable: true,
      program: `(ns hello.core)
  
(defn -main []
  (let [name (System/getenv "${ENV_VAR_NAME}")]
  (println (str "Hello, " name))))`,
      fileName: "core.clj",
      path: "src/hello",
      otherFiles: {
        "project.clj": `(defproject hello-world "0.1.0-SNAPSHOT"
  :dependencies [[org.clojure/clojure "1.10.3"]]
  :main hello.core)`,
      },
    },
  ],

  commonlisp: [
    {
      dockerizable: true,
      program: `(setq name (sb-ext:posix-getenv "${ENV_VAR_NAME}"))
(format t "Hello, ~a~%" name)`,
      ext: "lisp",
    },
  ],

  cpp: [
    {
      dockerizable: true,
      program: `#include <cstdlib>
#include <iostream>

int main() {
  const char* name = std::getenv("${ENV_VAR_NAME}");
  if (name)
      std::cout << "Hello, " << name << std::endl;
  return 0;
}`,
      ext: "cpp",
    },
  ],

  crystal: [
    {
      dockerizable: true,
      program: `puts "Hello, #{ENV["${ENV_VAR_NAME}"]}"`,
      ext: "cr",
    },
  ],

  csharp: [
    {
      dockerizable: true,
      program: `using System;
  
class Program
{
  static void Main()
  {
      string name = Environment.GetEnvironmentVariable("${ENV_VAR_NAME}");
      Console.WriteLine($"Hello, {name}");
  }
}`,
      ext: "cs",
      otherFiles: {
        "hello.csproj": `<Project Sdk="Microsoft.NET.Sdk">
      
<PropertyGroup>
<OutputType>Exe</OutputType>
<TargetFramework>net5.0</TargetFramework>
</PropertyGroup>

</Project>`,
      },
    },
  ],

  dart: [
    {
      dockerizable: true,
      program: `import 'dart:io';

  void main() {
    print('Hello, \${Platform.environment["${ENV_VAR_NAME}"]}');
  }`,
      ext: "dart",
    },
  ],

  delphi: [
    {
      dockerizable: true,
      program: `program Hello;
uses SysUtils;

var
  name: string;
begin
  name := GetEnvironmentVariable('${ENV_VAR_NAME}');
  WriteLn('Hello, ' + name);
end.`,
      ext: "dpr",
    },
  ],

  dlang: [
    {
      dockerizable: true,
      program: `import std;
import core.stdc.stdlib;

void main() {
    auto name = to!string(getenv("${ENV_VAR_NAME}"));
    writeln("Hello, ", name);
}`,
      ext: "d",
    },
    {
      dockerizable: true,
      program: `import std;
  
void main() {
    auto name = environment.get("${ENV_VAR_NAME}");
    writeln("Hello, ", name);
}`,
      ext: "d",
    },
  ],

  elixir: [
    {
      dockerizable: true,
      program: `IO.puts("Hello, " <> System.get_env("${ENV_VAR_NAME}"))`,
      ext: "ex",
    },
  ],

  erlang: [
    {
      dockerizable: true,
      program: `-module(hello).
-export([start/0]).

start() ->
    EnvVar = os:getenv("${ENV_VAR_NAME}"),
    io:format("Hello, ~s~n", [EnvVar]).`,
      ext: "erl",
    },
  ],

  fsharp: [
    {
      dockerizable: true,
      program: `module Hello

[<EntryPoint>]
let Main argv =
    let name = System.Environment.GetEnvironmentVariable("${ENV_VAR_NAME}")
    printfn "Hello, %s" name
    0`,
      ext: "fs",
      otherFiles: {
        "Hello.fsproj": `<Project Sdk="Microsoft.NET.Sdk">

<PropertyGroup>
  <OutputType>Exe</OutputType>
  <TargetFramework>net5.0</TargetFramework>
  <LangVersion>latest</LangVersion>
</PropertyGroup>

<ItemGroup>
  <Compile Include="*.fs" />
</ItemGroup>

</Project>`,
      },
    },
  ],

  go: [
    {
      dockerizable: true,
      program: `package main
import (
  "fmt"
  "os"
)

func main() {
  name := os.Getenv("${ENV_VAR_NAME}")
  fmt.Printf("Hello, %s\\n", name)
}`,
      ext: "go",
      otherFiles: {
        "go.mod": `module hello

go 1.16`,
      },
    },
  ],

  groovy: [
    {
      dockerizable: true,
      program: `def name = System.getenv("${ENV_VAR_NAME}")
  println "Hello, " + name`,
      ext: "groovy",
    },
  ],

  haskell: [
    {
      dockerizable: true,
      program: `import System.Environment (getEnv)

main :: IO ()
main = do
  name <- getEnv "${ENV_VAR_NAME}"
  putStrLn ("Hello, " ++ name)`,
      ext: "hs",
    },
  ],

  java: [
    {
      dockerizable: true,
      program: `public class Hello {
  public static void main(String[] args) {
      String name = System.getenv("${ENV_VAR_NAME}");
      System.out.println("Hello, " + name);
  }
}`,
      fileName: "Hello.java",
    },
  ],

  javascript: [
    {
      dockerizable: true,
      program: `console.log("Hello, " + process.env.${ENV_VAR_NAME});`,
      ext: "js",
    },
  ],

  julia: [
    {
      dockerizable: true,
      program: `name = ENV["${ENV_VAR_NAME}"]
println("Hello, $name")`,
      ext: "jl",
    },
  ],

  kotlin: [
    {
      dockerizable: true,
      program: `fun main() {
  val name = System.getenv("${ENV_VAR_NAME}")
  println("Hello, $name")
}`,
      ext: "kt",
    },
  ],

  lua: [
    {
      dockerizable: true,
      program: `name = os.getenv("${ENV_VAR_NAME}")
print("Hello, " .. name)`,
      ext: "lua",
    },
  ],

  makefile: [
    {
      dockerizable: true,
      program: `all:
\t@echo "Hello, $(${ENV_VAR_NAME})"`,
      fileName: "Makefile",
    },
  ],

  nim: [
    {
      dockerizable: true,
      program: `import os

echo "Hello, " & os.getEnv("${ENV_VAR_NAME}")`,
      ext: "nim",
    },
  ],

  ocaml: [
    {
      dockerizable: true,
      program: `let () =
let name = Sys.getenv "${ENV_VAR_NAME}" in
print_endline ("Hello, " ^ name)`,
      ext: "ml",
    },
  ],

  pascal: [
    {
      dockerizable: true,
      program: `program Hello;
uses SysUtils;
begin
  writeln('Hello, ' + GetEnvironmentVariable('${ENV_VAR_NAME}'));
end.`,
      ext: "pas",
    },
  ],

  perl: [
    {
      dockerizable: true,
      program: `my $name = $ENV{'${ENV_VAR_NAME}'};
print "Hello, $name\\n";`,
      ext: "pl",
    },
  ],

  php: [
    {
      dockerizable: true,
      program: `<?php
$name = getenv('${ENV_VAR_NAME}');
echo "Hello, $name\\n";
?>`,
      ext: "php",
    },
  ],

  powershell: [
    {
      dockerizable: true,
      program: `$name = $env:${ENV_VAR_NAME}
Write-Host "Hello, $name"`,
      ext: "ps1",
    },
  ],

  prolog: [
    {
      dockerizable: true,
      program: `:- initialization(main).
main :-
  getenv('${ENV_VAR_NAME}', Name),
  format("Hello, ~s~n", [Name]).`,
      ext: "pl",
    },
  ],

  python: [
    {
      dockerizable: true,
      program: `import os

name = os.environ.get('${ENV_VAR_NAME}')
print("Hello, " + name)`,
      ext: "py",
    },
  ],

  r: [
    {
      dockerizable: true,
      program: `name <- Sys.getenv("${ENV_VAR_NAME}")
cat(paste("Hello,", name))`,
      ext: "R",
    },
  ],

  racket: [
    {
      dockerizable: true,
      program: `#lang racket
(printf "Hello, ~a\\n" (getenv "${ENV_VAR_NAME}"))`,
      ext: "rkt",
    },
  ],

  ruby: [
    {
      dockerizable: true,
      program: `name = ENV['${ENV_VAR_NAME}']
puts "Hello, #{name}"`,
      ext: "rb",
    },
  ],

  rust: [
    {
      dockerizable: true,
      program: `fn main() {
  let name = std::env::var("${ENV_VAR_NAME}").unwrap();
  println!("Hello, {}", name);
}`,
      ext: "rs",
    },
  ],

  sas: [
    {
      dockerizable: false,
      program: `%let name = %sysget('${ENV_VAR_NAME}');
%put Hello, &name;`,
      ext: "sas",
    },
  ],

  scala: [
    {
      dockerizable: true,
      program: `object Hello extends App {
  val name = sys.env("${ENV_VAR_NAME}")
  println(s"Hello, $name")
}`,
      ext: "scala",
    },
  ],

  scheme: [
    {
      dockerizable: false,
      dockerfile: "scheme-mit",
      program: `(display "Hello, ")
(display (get-environment-variable "${ENV_VAR_NAME}"))
(newline)`,
      ext: "scm",
    },

    {
      dockerizable: true,
      dockerfile: "scheme-gauche",
      program: `(display "Hello, ")
(display (sys-getenv "${ENV_VAR_NAME}"))
(newline)`,
      ext: "scm",
    },
  ],

  shellscript: [
    {
      dockerizable: true,
      program: `#!/bin/sh
echo "Hello, \${${ENV_VAR_NAME}}"`,
      ext: "sh",
    },
  ],

  swift: [
    {
      dockerizable: true,
      program: `import Foundation

if let name = ProcessInfo.processInfo.environment["${ENV_VAR_NAME}"] {
  print("Hello, \\(name)")
}`,
      ext: "swift",
    },
  ],

  typescript: [
    {
      dockerizable: true,
      program: `console.log("Hello, " + process.env.${ENV_VAR_NAME});`,
      ext: "ts",
    },
  ],

  vba: [
    {
      dockerizable: false,
      program: `Sub Hello()
  name = Environ("${ENV_VAR_NAME}")
  MsgBox "Hello, " & name
End Sub`,
      ext: "vba",
    },
  ],

  vbnet: [
    {
      dockerizable: true,
      program: `Imports System

Module Hello
  Sub Main()
      Dim name As String = Environment.GetEnvironmentVariable("${ENV_VAR_NAME}")
      Console.WriteLine("Hello, " & name)
  End Sub
End Module`,
      fileName: "Hello.vb",
      otherFiles: {
        "Hello.vbproj": `<Project Sdk="Microsoft.NET.Sdk">

<PropertyGroup>
  <OutputType>Exe</OutputType>
  <TargetFramework>net5.0</TargetFramework>
  <RootNamespace>Hello</RootNamespace>
</PropertyGroup>
</Project>`,
      },
    },
  ],

  zig: [
    {
      dockerizable: true,
      program: `const std = @import("std");

pub fn main() void {
  const stdout = std.io.getStdOut().writer();
  const name = std.os.getenv("${ENV_VAR_NAME}") orelse "";
  stdout.print("Hello, {s}\\n", .{name}) catch {};
}`,
      ext: "zig",
    },
  ],
};
