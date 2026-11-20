// A single SQL write admits concurrent requests against the same counter atomically.
export function takeLimit(sql, key, maximum, periodMs) {
  const now = Date.now()
  const [counter] = sql.exec(`
    INSERT INTO request_limits (key, expires_at, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING attempts, expires_at
  `, key, now + periodMs, now, now)
  return counter.attempts > maximum ? Math.ceil((counter.expires_at - now) / 1000) : 0
}
