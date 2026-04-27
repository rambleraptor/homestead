# syntax=docker/dockerfile:1

# Build the Homestead aepbase wrapper. Mirrors aepbase/install.sh.
# CGO is disabled because modernc.org/sqlite is pure-Go.
FROM golang:1.25-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/aepbase .

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/aepbase /usr/local/bin/aepbase
COPY docker-entrypoint.sh /usr/local/bin/aepbase-entrypoint.sh
RUN chmod +x /usr/local/bin/aepbase-entrypoint.sh

EXPOSE 8090
VOLUME ["/data", "/var/log/aepbase"]
ENTRYPOINT ["/usr/local/bin/aepbase-entrypoint.sh"]
