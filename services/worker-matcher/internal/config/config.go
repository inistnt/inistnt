package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	ServiceName string
	LogLevel    string

	// PostgreSQL
	DatabaseURL string

	// Redis
	RedisAddr     string
	RedisPassword string

	// Kafka
	KafkaBrokers []string
	KafkaGroupID string
}

func Load() *Config {
	// Load .env if exists (dev only)
	_ = godotenv.Load()

	return &Config{
		ServiceName: getEnv("SERVICE_NAME", "worker-matcher"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),

		DatabaseURL: getEnv("DATABASE_URL",
			"postgres://inistnt:inistnt_dev_password@localhost:5432/inistnt_db?sslmode=disable"),

		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", "inistnt_redis_password"),

		KafkaBrokers: strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
		KafkaGroupID: getEnv("KAFKA_GROUP_ID", "worker-matching-go"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
