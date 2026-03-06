package redisclient

import (
	"context"
	"fmt"
	"time"

	"github.com/inistnt/worker-matcher/internal/config"
	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

func New(cfg *config.Config) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       0,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis connect failed: %w", err)
	}

	return &Client{rdb: rdb}, nil
}

// SetNX — set only if key doesn't exist (distributed lock)
func (c *Client) SetNX(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return c.rdb.SetNX(ctx, key, "1", ttl).Result()
}

func (c *Client) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.rdb.Set(ctx, key, value, ttl).Err()
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

func (c *Client) Del(ctx context.Context, keys ...string) error {
	return c.rdb.Del(ctx, keys...).Err()
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	n, err := c.rdb.Exists(ctx, key).Result()
	return n > 0, err
}

func (c *Client) Close() error {
	return c.rdb.Close()
}

// ─── REDIS KEY HELPERS ───────────────────────────────────────────────────────

func LockKey(bookingID string) string {
	return fmt.Sprintf("matching:lock:%s", bookingID)
}

func NotifiedKey(bookingID, workerID string) string {
	return fmt.Sprintf("matching:notified:%s:%s", bookingID, workerID)
}

func PendingAcceptKey(bookingID string) string {
	return fmt.Sprintf("matching:pending:%s", bookingID)
}

func AcceptedKey(bookingID string) string {
	return fmt.Sprintf("matching:accepted:%s", bookingID)
}
