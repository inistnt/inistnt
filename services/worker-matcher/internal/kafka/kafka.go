package kafkaclient

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/inistnt/worker-matcher/internal/config"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// ─── PRODUCER ────────────────────────────────────────────────────────────────

type Producer struct {
	writers map[string]*kafka.Writer
	brokers []string
	log     *zap.Logger
}

func NewProducer(cfg *config.Config, log *zap.Logger) *Producer {
	return &Producer{
		writers: make(map[string]*kafka.Writer),
		brokers: cfg.KafkaBrokers,
		log:     log,
	}
}

func (p *Producer) getWriter(topic string) *kafka.Writer {
	if w, ok := p.writers[topic]; ok {
		return w
	}
	w := &kafka.Writer{
		Addr:                   kafka.TCP(p.brokers...),
		Topic:                  topic,
		Balancer:               &kafka.LeastBytes{},
		AllowAutoTopicCreation: true,
		WriteTimeout:           10 * time.Second,
		ReadTimeout:            10 * time.Second,
	}
	p.writers[topic] = w
	return w
}

func (p *Producer) Publish(ctx context.Context, topic, key string, payload any) error {
	type meta struct {
		Topic     string `json:"topic"`
		Timestamp string `json:"timestamp"`
		Service   string `json:"service"`
	}

	type envelope struct {
		Meta meta `json:"_meta"`
	}

	// Merge payload with _meta
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	var merged map[string]any
	if err := json.Unmarshal(raw, &merged); err != nil {
		return err
	}
	merged["_meta"] = meta{
		Topic:     topic,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Service:   "worker-matcher",
	}

	data, err := json.Marshal(merged)
	if err != nil {
		return err
	}

	err = p.getWriter(topic).WriteMessages(ctx, kafka.Message{
		Key:   []byte(key),
		Value: data,
	})
	if err != nil {
		p.log.Error("Kafka publish failed",
			zap.String("topic", topic),
			zap.String("key", key),
			zap.Error(err),
		)
		return err
	}

	p.log.Debug("📤 Kafka message published",
		zap.String("topic", topic),
		zap.String("key", key),
	)
	return nil
}

func (p *Producer) Close() {
	for _, w := range p.writers {
		_ = w.Close()
	}
}

// ─── CONSUMER ────────────────────────────────────────────────────────────────

type MessageHandler func(ctx context.Context, topic string, data []byte) error

type Consumer struct {
	reader  *kafka.Reader
	handler MessageHandler
	log     *zap.Logger
}

func NewConsumer(cfg *config.Config, topics []string, handler MessageHandler, log *zap.Logger) *Consumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        cfg.KafkaBrokers,
		GroupID:        cfg.KafkaGroupID,
		GroupTopics:    topics,
		MinBytes:       1,
		MaxBytes:       10e6,
		CommitInterval: time.Second,
		StartOffset:    kafka.LastOffset,
		RetentionTime:  24 * time.Hour,
	})

	return &Consumer{
		reader:  reader,
		handler: handler,
		log:     log,
	}
}

func (c *Consumer) Start(ctx context.Context) error {
	c.log.Info("✅ Kafka consumer started", zap.String("groupId", c.reader.Config().GroupID))

	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil // Context cancelled — graceful shutdown
			}
			c.log.Error("FetchMessage error", zap.Error(err))
			time.Sleep(time.Second)
			continue
		}

		c.log.Debug("📩 Message received",
			zap.String("topic", msg.Topic),
			zap.String("key", string(msg.Key)),
		)

		if err := c.handler(ctx, msg.Topic, msg.Value); err != nil {
			c.log.Error("Message handler error",
				zap.String("topic", msg.Topic),
				zap.Error(err),
			)
			// Don't commit on error — will retry
			continue
		}

		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			c.log.Warn("CommitMessages failed", zap.Error(err))
		}
	}
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

func CheckBroker(brokers []string) error {
	conn, err := kafka.Dial("tcp", brokers[0])
	if err != nil {
		return fmt.Errorf("kafka dial failed: %w", err)
	}
	defer conn.Close()
	return nil
}
