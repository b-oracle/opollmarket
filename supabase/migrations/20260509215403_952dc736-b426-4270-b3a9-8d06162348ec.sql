DELETE FROM notifications n
USING markets m
WHERE n.market_id = m.id
  AND n.title = 'Market Ended ⏰'
  AND n.message LIKE 'Your market %'
  AND (m.is_crypto_round = true OR m.auto_resolve = true);