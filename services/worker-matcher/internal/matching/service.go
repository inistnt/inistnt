package matching

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	redisclient "github.com/inistnt/worker-matcher/internal/redis"
	"github.com/inistnt/worker-matcher/internal/models"
	"go.uber.org/zap"
)

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const (
	InitialRadiusKm  = 5.0
	MaxRadiusKm      = 15.0
	RadiusStepKm     = 5.0
	WorkerTimeoutSec = 45
	MaxAttempts      = 3
	LockTTL          = 5 * time.Minute
	PollInterval     = 2 * time.Second
)

// ─── PRODUCER INTERFACE ───────────────────────────────────────────────────────

type Producer interface {
	Publish(ctx context.Context, topic, key string, payload any) error
}

// ─── SERVICE ─────────────────────────────────────────────────────────────────

type Service struct {
	repo     *Repository
	redis    *redisclient.Client
	producer Producer
	log      *zap.Logger
}

func NewService(
	repo *Repository,
	redis *redisclient.Client,
	producer Producer,
	log *zap.Logger,
) *Service {
	return &Service{repo: repo, redis: redis, producer: producer, log: log}
}

// ─── MAIN ENTRY ──────────────────────────────────────────────────────────────

func (s *Service) StartMatching(ctx context.Context, event *models.BookingCreatedEvent) error {
	// Distributed lock — one process per booking
	lockKey := redisclient.LockKey(event.BookingID)
	locked, err := s.redis.SetNX(ctx, lockKey, LockTTL)
	if err != nil {
		return fmt.Errorf("redis lock: %w", err)
	}
	if !locked {
		s.log.Warn("Matching already in progress, skipping",
			zap.String("bookingId", event.BookingID))
		return nil
	}
	defer s.redis.Del(ctx, lockKey)

	s.log.Info("🔍 Starting worker matching",
		zap.String("bookingId", event.BookingID),
		zap.String("cityId", event.CityID),
		zap.Float64("lat", event.Lat),
		zap.Float64("lng", event.Lng),
	)

	return s.runMatchingRounds(ctx, event)
}

// ─── MATCHING ROUNDS (expanding radius) ──────────────────────────────────────

func (s *Service) runMatchingRounds(ctx context.Context, event *models.BookingCreatedEvent) error {
	for radius := InitialRadiusKm; radius <= MaxRadiusKm; radius += RadiusStepKm {

		s.log.Info("📡 Searching workers",
			zap.String("bookingId", event.BookingID),
			zap.Float64("radiusKm", radius),
		)

		candidates, err := s.repo.FindEligibleWorkers(ctx,
			event.CityID, event.ServiceID, event.Lat, event.Lng, radius)
		if err != nil {
			s.log.Error("FindEligibleWorkers failed", zap.Error(err))
			continue
		}

		// Filter already-notified workers
		fresh, err := s.filterNotified(ctx, event.BookingID, candidates)
		if err != nil {
			return err
		}

		if len(fresh) == 0 {
			s.log.Info("No fresh workers, expanding radius",
				zap.String("bookingId", event.BookingID))
			continue
		}

		// Try top N workers
		limit := MaxAttempts
		if len(fresh) < limit {
			limit = len(fresh)
		}

		for _, worker := range fresh[:limit] {
			// Re-check booking status
			booking, err := s.repo.GetBookingStatus(ctx, event.BookingID)
			if err != nil || booking.Status != "SEARCHING" {
				s.log.Info("✅ Booking no longer searching, stopping",
					zap.String("bookingId", event.BookingID))
				return nil
			}

			assigned, err := s.tryWorker(ctx, event, worker)
			if err != nil {
				s.log.Error("tryWorker error", zap.Error(err))
				continue
			}
			if assigned {
				return nil
			}
		}
	}

	// All rounds exhausted
	return s.handleNoWorker(ctx, event)
}

// ─── TRY SINGLE WORKER ───────────────────────────────────────────────────────

func (s *Service) tryWorker(
	ctx context.Context,
	event *models.BookingCreatedEvent,
	worker *models.WorkerCandidate,
) (bool, error) {
	bookingID := event.BookingID
	workerID  := worker.ID

	// Mark as notified
	_ = s.redis.Set(ctx, redisclient.NotifiedKey(bookingID, workerID), "1", LockTTL)
	s.repo.LogAttempt(ctx, bookingID, workerID, "notified")

	// Estimated arrival (avg 20 km/h city speed)
	etaMin := int(math.Ceil((worker.Distance / 20.0) * 60))

	// Set pending accept key
	_ = s.redis.Set(ctx,
		redisclient.PendingAcceptKey(bookingID),
		workerID,
		time.Duration(WorkerTimeoutSec+5)*time.Second,
	)

	// Notify worker via Kafka
	amount := float64(event.Amount) / 100.0
	s.producer.Publish(ctx, models.TopicNotificationSend, bookingID, &models.NotificationSendEvent{
		RecipientType: "worker",
		RecipientID:   workerID,
		Channels:      []string{"push"},
		Title:         "🔔 Naya Booking Request!",
		Body: fmt.Sprintf("₹%.0f ki booking — %.1f km door. %ds mein accept karein.",
			amount, worker.Distance, WorkerTimeoutSec),
		DeepLink:  fmt.Sprintf("inistnt://booking/%s/accept", bookingID),
		BookingID: bookingID,
	})

	s.log.Info("📲 Notified worker, waiting...",
		zap.String("bookingId", bookingID),
		zap.String("workerId", workerID),
		zap.Float64("distKm", worker.Distance),
		zap.Int("timeoutSec", WorkerTimeoutSec),
	)

	// Poll for acceptance
	accepted := s.waitForAcceptance(ctx, bookingID, workerID, WorkerTimeoutSec)

	if accepted {
		// Assign in DB
		if err := s.repo.AssignWorker(ctx, bookingID, workerID, etaMin); err != nil {
			return false, fmt.Errorf("AssignWorker: %w", err)
		}
		s.repo.LogAttempt(ctx, bookingID, workerID, "assigned")

		// Publish booking.assigned
		s.producer.Publish(ctx, models.TopicBookingAssigned, bookingID, &models.BookingAssignedEvent{
			BookingID:           bookingID,
			WorkerID:            workerID,
			UserID:              event.UserID,
			WorkerLat:           worker.CurrentLat,
			WorkerLng:           worker.CurrentLng,
			EstimatedArrivalMin: etaMin,
		})

		// Notify user
		s.producer.Publish(ctx, models.TopicNotificationSend, bookingID, &models.NotificationSendEvent{
			RecipientType: "user",
			RecipientID:   event.UserID,
			Channels:      []string{"push"},
			Title:         "✅ Worker mil gaya!",
			Body:          fmt.Sprintf("%s aa rahe hain — %d min mein pahunchenge.", worker.Name, etaMin),
			DeepLink:      fmt.Sprintf("inistnt://booking/%s/track", bookingID),
			BookingID:     bookingID,
		})

		s.log.Info("✅ Worker assigned!",
			zap.String("bookingId", bookingID),
			zap.String("workerId", workerID),
			zap.Int("etaMin", etaMin),
		)
		return true, nil
	}

	// Timeout
	s.repo.LogAttempt(ctx, bookingID, workerID, "timeout")
	_ = s.redis.Del(ctx, redisclient.PendingAcceptKey(bookingID))
	s.log.Info("⏱ Worker timeout, trying next",
		zap.String("bookingId", bookingID),
		zap.String("workerId", workerID),
	)
	return false, nil
}

// ─── POLL REDIS FOR ACCEPTANCE ────────────────────────────────────────────────

func (s *Service) waitForAcceptance(ctx context.Context, bookingID, workerID string, timeoutSec int) bool {
	acceptedKey := redisclient.AcceptedKey(bookingID)
	deadline    := time.Now().Add(time.Duration(timeoutSec) * time.Second)

	for time.Now().Before(deadline) {
		val, err := s.redis.Get(ctx, acceptedKey)
		if err == nil && val == workerID {
			_ = s.redis.Del(ctx, acceptedKey)
			return true
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(PollInterval):
		}
	}
	return false
}

// ─── WORKER ACCEPTED (from BOOKING_ACCEPTED Kafka event) ─────────────────────

func (s *Service) OnWorkerAccepted(ctx context.Context, event *models.BookingAcceptedEvent) error {
	pendingKey := redisclient.PendingAcceptKey(event.BookingID)
	pending, err := s.redis.Get(ctx, pendingKey)
	if err != nil {
		return nil // No pending worker for this booking
	}

	if pending == event.WorkerID {
		acceptedKey := redisclient.AcceptedKey(event.BookingID)
		_ = s.redis.Set(ctx, acceptedKey, event.WorkerID, 60*time.Second)
		s.log.Info("👍 Worker acceptance recorded",
			zap.String("bookingId", event.BookingID),
			zap.String("workerId", event.WorkerID),
		)
	} else {
		s.log.Warn("Worker accepted but was not pending",
			zap.String("bookingId", event.BookingID),
			zap.String("acceptedWorker", event.WorkerID),
			zap.String("pendingWorker", pending),
		)
	}
	return nil
}

// ─── NO WORKER FOUND ─────────────────────────────────────────────────────────

func (s *Service) handleNoWorker(ctx context.Context, event *models.BookingCreatedEvent) error {
	s.log.Warn("❌ No worker found",
		zap.String("bookingId", event.BookingID),
		zap.String("cityId", event.CityID),
	)

	if err := s.repo.MarkNoWorker(ctx, event.BookingID); err != nil {
		s.log.Error("MarkNoWorker failed", zap.Error(err))
	}

	s.producer.Publish(ctx, models.TopicBookingNoWorker, event.BookingID, &models.BookingNoWorkerEvent{
		BookingID: event.BookingID,
		UserID:    event.UserID,
	})

	s.producer.Publish(ctx, models.TopicNotificationSend, event.BookingID, &models.NotificationSendEvent{
		RecipientType: "user",
		RecipientID:   event.UserID,
		Channels:      []string{"push", "sms"},
		Title:         "Worker nahi mila 😔",
		Body:          "Abhi koi worker available nahi hai. Please thodi der baad try karein.",
		BookingID:     event.BookingID,
	})

	return nil
}

// ─── FILTER ALREADY-NOTIFIED WORKERS ────────────────────────────────────────

func (s *Service) filterNotified(
	ctx context.Context,
	bookingID string,
	workers []*models.WorkerCandidate,
) ([]*models.WorkerCandidate, error) {
	var fresh []*models.WorkerCandidate
	for _, w := range workers {
		exists, err := s.redis.Exists(ctx, redisclient.NotifiedKey(bookingID, w.ID))
		if err != nil {
			return nil, err
		}
		if !exists {
			fresh = append(fresh, w)
		}
	}
	return fresh, nil
}

// ─── JSON HELPERS ─────────────────────────────────────────────────────────────

func ParseBookingCreated(data []byte) (*models.BookingCreatedEvent, error) {
	var e models.BookingCreatedEvent
	if err := json.Unmarshal(data, &e); err != nil {
		return nil, err
	}
	return &e, nil
}

func ParseBookingAccepted(data []byte) (*models.BookingAcceptedEvent, error) {
	var e models.BookingAcceptedEvent
	if err := json.Unmarshal(data, &e); err != nil {
		return nil, err
	}
	return &e, nil
}
