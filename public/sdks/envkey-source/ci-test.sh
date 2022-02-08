#! /bin/bash

go clean -testcache
go test -v ./...
