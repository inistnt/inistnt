package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/inistnt/worker-matcher/internal/config"
	"github.com/inistnt/worker-matcher/internal/db"
	kafkaclient "github.com/inistnt/worker-matcher/internal/kafka"
	"github.com/inistnt/worker-matcher/internal/matching"
	"github.com/inistnt/worker-matcher/internal/models"
	redisclient "github.com/inistnt/worker-matcher/internal/redis"
	"go.uber.org/zap"
)

func main() {
	// ─── LOGGER ──────────────────────────────────────────────
	log, _ := zap.NewProduction()
	defer log.Sync()

	log.Info("🚀 Worker Matcher Service starting...")

	// ─── CONFIG ──────────────────────────────────────────────
	cfg := config.Load()
	log.Info("Config loaded",
		zap.String("service", cfg.ServiceName),
		zap.Strings("kafkaBrokers", cfg.KafkaBrokers),
	)

	// ─── DATABASE ────────────────────────────────────────────
	database, err := db.New(cfg)
	if err != nil {
		log.Fatal("DB connection failed", zap.Error(err))
	}
	defer database.Close()
	log.Info("✅ PostgreSQL connected")

	// ─── REDIS ───────────────────────────────────────────────
	redis, err := redisclient.New(cfg)
	if err != nil {
		log.Fatal("Redis connection failed", zap.Error(err))
	}
	defer redis.Close()
	log.Info("✅ Redis connected")

	// ─── KAFKA PRODUCER ──────────────────────────────────────
	producer := kafkaclient.NewProducer(cfg, log)
	defer producer.Close()

	// Verify broker reachable
	if err := kafkaclient.CheckBroker(cfg.KafkaBrokers); err != nil {
		log.Fatal("Kafka broker unreachable", zap.Error(err))
	}
	log.Info("✅ Kafka producer ready")

	// ─── MATCHING SERVICE ────────────────────────────────────
	repo    := matching.NewRepository(database)
	svc     := matching.NewService(repo, redis, producer, log)

	// ─── KAFKA CONSUMER ──────────────────────────────────────
	topics := []string{
		models.TopicBookingCreated,
		models.TopicBookingAccepted,
	}

	consumer := kafkaclient.NewConsumer(cfg, topics, func(ctx context.Context, topic string, data []byte) error {
		switch topic {

		case models.TopicBookingCreated:
			event, err := matching.ParseBookingCreated(data)
			if err != nil {
				log.Error("Parse BOOKING_CREATED failed", zap.Error(err))
				return nil // don't retry parse errors
			}
			log.Info("📩 BOOKING_CREATED",
				zap.String("bookingId", event.BookingID),
				zap.String("cityId", event.CityID),
			)
			return svc.StartMatching(ctx, event)

		case models.TopicBookingAccepted:
			event, err := matching.ParseBookingAccepted(data)
			if err != nil {
				log.Error("Parse BOOKING_ACCEPTED failed", zap.Error(err))
				return nil
			}
			log.Info("📩 BOOKING_ACCEPTED",
				zap.String("bookingId", event.BookingID),
				zap.String("workerId", event.WorkerID),
			)
			return svc.OnWorkerAccepted(ctx, event)
		}

		return nil
	}, log)

	// ─── GRACEFUL SHUTDOWN ───────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-sigCh
		log.Info("Shutdown signal received", zap.String("signal", sig.String()))
		cancel()
	}()

	log.Info("🎯 Worker Matcher ready — listening for bookings",
		zap.Strings("topics", topics),
	)

	// Start consuming (blocks until ctx cancelled)
	if err := consumer.Start(ctx); err != nil {
		log.Error("Consumer error", zap.Error(err))
	}

	_ = consumer.Close()
	log.Info("👋 Worker Matcher shutdown complete")
}
