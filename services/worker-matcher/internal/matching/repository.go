package matching

import (
	"context"
	"math"
	"time"

	"github.com/inistnt/worker-matcher/internal/db"
	"github.com/inistnt/worker-matcher/internal/models"
)

// ─── HAVERSINE DISTANCE ──────────────────────────────────────────────────────

func DistanceKm(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// ─── WORKER SCORING ──────────────────────────────────────────────────────────
//
// Distance:        0–10 km  → 0–50 pts
// Tier bonus:      BASIC=0  SILVER=5  GOLD=10  PLATINUM=15
// Rating:          0–5      → 0–25 pts
// Acceptance rate: 0–1      → 0–10 pts
// Uniform score:   0–1      → 0–5 pts

func ScoreWorker(w *models.WorkerCandidate, bookingLat, bookingLng float64) float64 {
	dist := DistanceKm(w.CurrentLat, w.CurrentLng, bookingLat, bookingLng)
	distScore := math.Max(0, 50-dist*5)

	tierBonus := map[string]float64{
		"BASIC": 0, "SILVER": 5, "GOLD": 10, "PLATINUM": 15,
	}

	return distScore +
		tierBonus[w.Tier] +
		w.Rating*5 +
		w.AcceptanceRate*10 +
		w.UniformComplianceScore*5
}

// ─── REPOSITORY ──────────────────────────────────────────────────────────────

type Repository struct {
	db *db.DB
}

func NewRepository(database *db.DB) *Repository {
	return &Repository{db: database}
}

// FindEligibleWorkers — online, verified, nearby, not busy, has skill
func (r *Repository) FindEligibleWorkers(
	ctx context.Context,
	cityID, serviceID string,
	lat, lng, radiusKm float64,
) ([]*models.WorkerCandidate, error) {

	// Step 1: Get service's categoryId
	var categoryID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT category_id FROM services WHERE id = $1`, serviceID,
	).Scan(&categoryID)
	if err != nil {
		return nil, err
	}

	// Step 2: Find online verified workers with skill, not currently on a job
	rows, err := r.db.Pool.Query(ctx, `
		SELECT
			w.id, w.name, w.tier, w.rating,
			w.acceptance_rate, w.uniform_compliance_score,
			w.current_lat, w.current_lng, w.fcm_token, w.last_location_at
		FROM workers w
		WHERE
			w.city_id = $1
			AND w.is_online = true
			AND w.status = 'VERIFIED'
			AND w.current_lat IS NOT NULL
			AND w.current_lng IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM bookings b
				WHERE b.worker_id = w.id
				  AND b.status IN (
				    'ASSIGNED','WORKER_ACCEPTED','WORKER_ON_WAY',
				    'WORKER_ARRIVED','IN_PROGRESS'
				  )
			)
			AND EXISTS (
				SELECT 1 FROM worker_skills ws
				WHERE ws.worker_id = w.id
				  AND ws.service_category_id = $2
			)
	`, cityID, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	staleThreshold := 10 * time.Minute
	var candidates []*models.WorkerCandidate

	for rows.Next() {
		var w models.WorkerCandidate
		var lastLocationAt *time.Time

		if err := rows.Scan(
			&w.ID, &w.Name, &w.Tier, &w.Rating,
			&w.AcceptanceRate, &w.UniformComplianceScore,
			&w.CurrentLat, &w.CurrentLng, &w.FCMToken, &lastLocationAt,
		); err != nil {
			continue
		}

		// Skip stale locations
		if lastLocationAt != nil && time.Since(*lastLocationAt) > staleThreshold {
			continue
		}

		// Filter by radius
		dist := DistanceKm(w.CurrentLat, w.CurrentLng, lat, lng)
		if dist > radiusKm {
			continue
		}

		w.Distance = dist
		w.Score = ScoreWorker(&w, lat, lng)
		candidates = append(candidates, &w)
	}

	// Sort by score descending
	sortByScore(candidates)
	return candidates, nil
}

func sortByScore(workers []*models.WorkerCandidate) {
	for i := 1; i < len(workers); i++ {
		for j := i; j > 0 && workers[j].Score > workers[j-1].Score; j-- {
			workers[j], workers[j-1] = workers[j-1], workers[j]
		}
	}
}

// AssignWorker — update booking with workerId
func (r *Repository) AssignWorker(ctx context.Context, bookingID, workerID string, etaMin int) error {
	_, err := r.db.Pool.Exec(ctx, `
		UPDATE bookings
		SET
			worker_id              = $1,
			status                 = 'ASSIGNED',
			worker_assigned_at     = NOW(),
			estimated_arrival_min  = $2,
			updated_at             = NOW()
		WHERE id = $3
	`, workerID, etaMin, bookingID)
	return err
}

// MarkNoWorker — no workers found
func (r *Repository) MarkNoWorker(ctx context.Context, bookingID string) error {
	_, err := r.db.Pool.Exec(ctx, `
		UPDATE bookings SET status = 'NO_WORKER_FOUND', updated_at = NOW()
		WHERE id = $1
	`, bookingID)
	return err
}

// GetBookingStatus — check current status
func (r *Repository) GetBookingStatus(ctx context.Context, bookingID string) (*models.BookingStatus, error) {
	var b models.BookingStatus
	err := r.db.Pool.QueryRow(ctx,
		`SELECT id, status, user_id FROM bookings WHERE id = $1`, bookingID,
	).Scan(&b.ID, &b.Status, &b.UserID)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// LogAttempt — audit trail
func (r *Repository) LogAttempt(ctx context.Context, bookingID, workerID, note string) {
	// non-critical, ignore errors
	_, _ = r.db.Pool.Exec(ctx, `
		INSERT INTO booking_status_histories
			(id, booking_id, status, changed_by_id, changed_by_type, note, created_at)
		VALUES
			(gen_random_uuid(), $1, 'SEARCHING', $2, 'worker', $3, NOW())
	`, bookingID, workerID, note)
}
