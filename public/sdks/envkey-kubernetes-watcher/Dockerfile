# Build the watcher binary
FROM --platform=${BUILDPLATFORM} golang:1.17 as builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /workspace

COPY go.mod go.mod
COPY go.sum go.sum
RUN go mod download

COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} GO111MODULE=on go build -mod=mod -a -o watcher main.go

# Use distroless as minimal base image to package the manager binary
# Refer to https://github.com/GoogleContainerTools/distroless for more details
FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY --from=builder /workspace/watcher .
USER 65532:65532

# Port for metrics and probes
EXPOSE 9090

ENTRYPOINT ["/watcher"]