export const dockerfiles: Record<string, string> = {
  c: `FROM gcc:11.2.0
WORKDIR /usr/src/app
COPY . .
RUN gcc -o hello hello.c
CMD ["./hello"]`,

  clojure: `FROM clojure:temurin-20-lein-2.10.0-alpine
WORKDIR /usr/src/app
COPY . .
CMD ["lein", "run"]`,

  commonlisp: `FROM daewok/lisp-devel:latest
WORKDIR /usr/src/app
COPY hello.lisp .
ENTRYPOINT ["sbcl", "--script", "hello.lisp"]`,

  cpp: `FROM gcc:11.2.0
WORKDIR /usr/src/app
COPY . .
RUN g++ -o hello hello.cpp
CMD ["./hello"]`,

  crystal: `FROM crystallang/crystal:1.2.1
WORKDIR /usr/src/app
COPY . .
RUN crystal build hello.cr
CMD ["./hello"]`,

  csharp: `FROM mcr.microsoft.com/dotnet/sdk:5.0.401
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o out
CMD ["dotnet", "out/hello.dll"]`,

  dart: `FROM google/dart:2.14.4
WORKDIR /usr/src/app
COPY . .
RUN dart compile exe -o hello hello.dart
CMD ["./hello"]`,

  delphi: `FROM freepascal/fpc:3.2.2-slim
WORKDIR /usr/src/app
COPY . .
RUN fpc -ohello hello.dpr
CMD ["./hello"]`,

  dlang: `FROM dlang2/dmd-ubuntu:2.096.1
WORKDIR /usr/src/app
COPY . .
RUN dmd hello.d -ofhello
CMD ["./hello"]`,

  elixir: `FROM elixir:1.12.1
WORKDIR /usr/src/app
COPY . .
CMD ["elixir", "hello.ex"]`,

  erlang: `FROM erlang:24.0.6
WORKDIR /usr/src/app
COPY . .
RUN erlc hello.erl
CMD ["erl", "-noshell", "-s", "hello", "start", "-s", "init", "stop"]`,

  fsharp: `FROM mcr.microsoft.com/dotnet/sdk:5.0.401
WORKDIR /app
COPY . .
CMD ["dotnet", "run"]`,

  go: `FROM golang:1.16.6
WORKDIR /usr/src/app
COPY . .
RUN go build -o hello
CMD ["./hello"]`,

  groovy: `FROM groovy:3.0.9
WORKDIR /usr/src/app
COPY . .
CMD ["groovy", "hello.groovy"]`,

  haskell: `FROM haskell:9.0.1
WORKDIR /usr/src/app
COPY . .
RUN ghc -o hello hello.hs
CMD ["./hello"]`,

  java: `FROM openjdk:17
WORKDIR /usr/src/app
COPY . .
RUN javac Hello.java
CMD ["java", "Hello"]`,

  javascript: `FROM node:16.4.2
WORKDIR /usr/src/app
COPY . .
CMD ["node", "hello.js"]`,

  julia: `FROM julia:1.6.3
WORKDIR /usr/src/app
COPY . .
CMD ["julia", "hello.jl"]`,

  kotlin: `FROM openjdk:11
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y wget zip \
  && wget https://github.com/JetBrains/kotlin/releases/download/v1.5.31/kotlin-compiler-1.5.31.zip \
      && unzip kotlin-compiler-1.5.31.zip \
      && mv kotlinc /usr/local/bin/ \
      && chmod +x /usr/local/bin/kotlinc/bin/kotlinc
ENV PATH="\${PATH}:/usr/local/bin/kotlinc/bin"
COPY . .
RUN kotlinc hello.kt -include-runtime -d hello.jar
CMD ["java", "-jar", "hello.jar"]`,

  lua: `FROM alpine:3.15
RUN apk add --no-cache lua5.4
WORKDIR /usr/src/app
COPY . .
CMD ["lua5.4", "hello.lua"]`,

  makefile: `FROM alpine:3.15
RUN apk add --no-cache make
WORKDIR /usr/src/app
COPY . .
CMD ["make"]`,

  nim: `FROM nimlang/nim:1.4.8
WORKDIR /usr/src/app
COPY . .
RUN nim c -d:release -o:hello hello.nim
CMD ["./hello"]`,

  // The ocaml container takes 10 minutes to build even when cached :-/
  //   ocaml: `FROM ocaml/opam:alpine-ocaml-4.14
  // WORKDIR /usr/src/app
  // COPY . .
  // RUN opam switch create . ocaml-base-compiler.4.14.0
  // RUN eval $(opam env) && ocamlc -o hello hello.ml
  // CMD ["./hello"]`,

  pascal: `FROM freepascal/fpc:3.2.2-slim
WORKDIR /usr/src/app
COPY . .
RUN fpc -ohello hello.pas
CMD ["./hello"]`,

  perl: `FROM perl:5.34.0
WORKDIR /usr/src/app
COPY . .
CMD ["perl", "hello.pl"]`,

  php: `FROM php:8.0.10
WORKDIR /usr/src/app
COPY . .
CMD ["php", "hello.php"]`,

  powershell: `FROM mcr.microsoft.com/powershell:lts-7.2-alpine-3.14
WORKDIR /app
COPY . .
CMD ["pwsh", "-File", "hello.ps1"]`,

  prolog: `FROM swipl:8.4.0
WORKDIR /usr/src/app
COPY . .
CMD ["swipl", "-s", "hello.pl"]`,

  python: `FROM python:3.10.0
WORKDIR /usr/src/app
COPY . .
CMD ["python", "hello.py"]`,

  r: `FROM r-base:4.1.1
WORKDIR /usr/src/app
COPY . .
CMD ["Rscript", "hello.R"]`,

  racket: `FROM racket/racket:8.1
WORKDIR /usr/src/app
COPY . .
CMD ["racket", "hello.rkt"]`,

  ruby: `FROM ruby:3.0.2
WORKDIR /usr/src/app
COPY . .
CMD ["ruby", "hello.rb"]`,

  rust: `FROM rust:1.55.0
WORKDIR /usr/src/app
COPY . .
RUN rustc hello.rs
CMD ["./hello"]`,

  scala: `FROM hseeberger/scala-sbt:11.0.12_1.5.5_2.13.6
WORKDIR /usr/src/app
COPY . .
RUN scalac hello.scala
CMD ["scala", "Hello"]`,

  "scheme-gauche": `FROM ubuntu:20.04
RUN apt-get update && apt-get install -y gauche
WORKDIR /usr/src/app
COPY . .
CMD ["gosh", "hello.scm"]`,

  shellscript: `FROM alpine:3.14.2
WORKDIR /usr/src/app
COPY . .
CMD ["sh", "hello.sh"]`,

  swift: `FROM swift:5.5.1
WORKDIR /usr/src/app
COPY . .
RUN swiftc hello.swift
CMD ["./hello"]`,

  typescript: `FROM node:16.4.2
WORKDIR /usr/src/app
COPY . .
RUN npm install -g ts-node
CMD ["ts-node", "hello.ts"]`,

  vbnet: `FROM mcr.microsoft.com/dotnet/sdk:5.0.401
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o out
CMD ["dotnet", "out/Hello.dll"]`,

  zig: `FROM alpine:3.16
ARG ZIG_VERSION=0.9.1
ARG ZIG_URL=https://ziglang.org/download/\${ZIG_VERSION}/zig-linux-x86_64-\${ZIG_VERSION}.tar.xz
RUN apk add --no-cache curl xz
RUN mkdir /usr/local/bin/zig
RUN curl -L \${ZIG_URL} | tar -xJ -C /usr/local/bin/zig --strip-components 1
RUN chmod +x /usr/local/bin/zig/zig
ENV PATH "/usr/local/bin/zig:\${PATH}"
WORKDIR /usr/src/app
COPY . .
RUN zig build-exe hello.zig
CMD ["./hello"]`,
};
