-- ============================================================
-- r1/p2/rate-matrix
-- ============================================================
BEGIN;
SELECT plan(12);

-- "recipient:type:rate:gross/reserve/net, …" with trailing zeros trimmed
CREATE FUNCTION pg_temp.split_str(p_points numeric, p_rate numeric, p_chain jsonb, p_ratio numeric DEFAULT 0.10)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(format('%s:%s:%s:%s/%s/%s', e ->> 'recipient', e ->> 'type',
           trim_scale((e ->> 'rate')::numeric), (e ->> 'gross')::numeric, (e ->> 'reserve')::numeric, (e ->> 'net')::numeric),
           ', ' ORDER BY (e ->> 'depth')::int), '')
    FROM jsonb_array_elements(app_private.commission_split(p_points, 'P', p_rate, p_chain, p_ratio)) e
$$;

-- ---------- golden cases (shared with src/domain/commission.test.ts) ----------
SELECT is(pg_temp.split_str(10, 56, '[]'), 'P:personal:56:560.00/56.00/504.00',
  'GC-COMM-001 FB with 10 own points: 560 gross, 56 reserve, 504 after reserve (§14.2)');
SELECT is(pg_temp.split_str(10, 28, '[{"id":"FB","rate":"56"}]'),
  'P:personal:28:280.00/28.00/252.00, FB:differential:28:280.00/28.00/252.00',
  'GC-COMM-002 FB over FA: 28 €/P → 280 / 28 / 252 (§14.2, §17.3)');
SELECT is(pg_temp.split_str(10, 28, '[{"id":"FB","rate":"56"},{"id":"TL","rate":"70"},{"id":"DL","rate":"112"}]'),
  'P:personal:28:280.00/28.00/252.00, FB:differential:28:280.00/28.00/252.00, TL:differential:14:140.00/14.00/126.00, DL:differential:42:420.00/42.00/378.00',
  'GC-COMM-003 DL → TL → FB → FA, 10 points: 280 / 140 / 420 (§5.3)');
SELECT is(pg_temp.split_str(10, 28, '[{"id":"DL","rate":"112"}]'),
  'P:personal:28:280.00/28.00/252.00, DL:differential:84:840.00/84.00/756.00',
  'GC-COMM-004 DL directly above FA gets the full difference (provisional, OD-05)');
SELECT is(pg_temp.split_str(10, 56, '[{"id":"FB2","rate":"56"},{"id":"TL","rate":"70"}]'),
  'P:personal:56:560.00/56.00/504.00, TL:differential:14:140.00/14.00/126.00',
  'GC-COMM-005 manager on the same level earns no differential');
SELECT is(pg_temp.split_str(0.0001, 56, '[]'), 'P:personal:56:0.01/0.00/0.01',
  'GC-COMM-006 tiny amounts: gross rounds half-up to 0.01, reserve to 0.00');
SELECT is(pg_temp.split_str(3.1415, 56, '[]'), 'P:personal:56:175.92/17.59/158.33',
  'GC-COMM-007 175.924 → 175.92, reserve 17.59, net 158.33');
SELECT is(pg_temp.split_str(0, 56, '[{"id":"TL","rate":"70"}]'), '',
  'GC-COMM-008 zero points (e.g. Kfz) book nothing');
SELECT is(pg_temp.split_str(-10, 28, '[{"id":"FB","rate":"56"}]'),
  'P:personal:28:-280.00/-28.00/-252.00, FB:differential:28:-280.00/-28.00/-252.00',
  'GC-COMM-009 negative points (reversal) mirror exactly');
SELECT is(pg_temp.split_str(10, 70, '[{"id":"FB","rate":"56"},{"id":"DL","rate":"112"}]'),
  'P:personal:70:700.00/70.00/630.00, DL:differential:42:420.00/42.00/378.00',
  'GC-COMM-010 lower-level manager gets nothing; the next higher one gets the gap');
SELECT is(pg_temp.split_str(10, 28, '[{"id":"X","rate":null},{"id":"TL","rate":"70"}]'),
  'P:personal:28:280.00/28.00/252.00, TL:differential:42:420.00/42.00/378.00',
  'GC-COMM-011 ancestor without a level is skipped by the pure function (booking flags it)');

-- ---------- reserve ratio is a versioned rule ----------
SELECT is((SELECT reserve_ratio FROM public.rule_versions WHERE kind = 'levels' AND status = 'published' ORDER BY effective_from LIMIT 1),
  0.1000::numeric, 'seeded levels version has a 10 % reserve');

SELECT * FROM finish();
ROLLBACK;
