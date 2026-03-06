package models

// ─── KAFKA TOPICS ─────────────────────────────────────────────────────────────

const (
	TopicBookingCreated   = "booking.created"
	TopicBookingAssigned  = "booking.assigned"
	TopicBookingAccepted  = "booking.accepted"
	TopicBookingNoWorker  = "booking.no_worker_found"
	TopicNotificationSend = "notification.send"
)

// ─── INBOUND EVENTS ──────────────────────────────────────────────────────────

type BookingCreatedEvent struct {
	BookingID    string  `json:"bookingId"`
	UserID       string  `json:"userId"`
	ServiceID    string  `json:"serviceId"`
	CityID       string  `json:"cityId"`
	AreaID       string  `json:"areaId,omitempty"`
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	Amount       int64   `json:"amount"`
	ScheduledFor string  `json:"scheduledFor,omitempty"`
}

type BookingAcceptedEvent struct {
	BookingID string `json:"bookingId"`
	WorkerID  string `json:"workerId"`
	UserID    string `json:"userId"`
}

// ─── OUTBOUND EVENTS ─────────────────────────────────────────────────────────

type BookingAssignedEvent struct {
	BookingID           string  `json:"bookingId"`
	WorkerID            string  `json:"workerId"`
	UserID              string  `json:"userId"`
	WorkerLat           float64 `json:"workerLat"`
	WorkerLng           float64 `json:"workerLng"`
	EstimatedArrivalMin int     `json:"estimatedArrivalMin"`
}

type BookingNoWorkerEvent struct {
	BookingID string `json:"bookingId"`
	UserID    string `json:"userId"`
}

type NotificationSendEvent struct {
	RecipientType string   `json:"recipientType"` // user | worker
	RecipientID   string   `json:"recipientId"`
	Channels      []string `json:"channels"`
	Title         string   `json:"title"`
	Body          string   `json:"body"`
	DeepLink      string   `json:"deepLink,omitempty"`
	BookingID     string   `json:"bookingId,omitempty"`
}

// ─── DB MODELS ───────────────────────────────────────────────────────────────

type WorkerCandidate struct {
	ID                     string
	Name                   string
	Tier                   string
	Rating                 float64
	AcceptanceRate         float64
	UniformComplianceScore float64
	CurrentLat             float64
	CurrentLng             float64
	FCMToken               *string
	Distance               float64 // calculated
	Score                  float64 // calculated
}

type BookingStatus struct {
	ID     string
	Status string
	UserID string
}
