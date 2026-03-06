# ─── BUILD STAGE ─────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o worker-matcher ./cmd/main.go

# ─── RUNTIME STAGE ───────────────────────────────────────────
FROM alpine:3.19

WORKDIR /app

# Security: non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy binary and CA certs
COPY --from=builder /app/worker-matcher .
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8090

CMD ["./worker-matcher"]
