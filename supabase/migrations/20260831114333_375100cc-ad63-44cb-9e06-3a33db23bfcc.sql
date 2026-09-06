
WITH ranked AS (
  SELECT id, series_id, model_id,
         ROW_NUMBER() OVER (
           PARTITION BY series_id, model_id
           ORDER BY (SELECT count(*) FROM jsonb_object_keys(d0.values)) DESC, created_at ASC
         ) AS rn
  FROM air_curtain_dimensions d0
  WHERE model_id IS NOT NULL
),
agg AS (
  SELECT series_id, model_id, jsonb_object_agg(k, v) AS merged
  FROM (
    SELECT DISTINCT ON (d1.series_id, d1.model_id, k)
           d1.series_id, d1.model_id, k, v
    FROM air_curtain_dimensions d1, LATERAL jsonb_each(d1.values) AS e(k, v)
    WHERE d1.model_id IS NOT NULL
    ORDER BY d1.series_id, d1.model_id, k,
             (SELECT count(*) FROM jsonb_object_keys(d1.values)) DESC
  ) s
  GROUP BY series_id, model_id
)
UPDATE air_curtain_dimensions d
SET values = a.merged
FROM agg a, ranked r
WHERE r.id = d.id AND r.rn = 1
  AND a.series_id = d.series_id AND a.model_id = d.model_id;

DELETE FROM air_curtain_dimensions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY series_id, model_id
      ORDER BY created_at ASC
    ) AS rn
    FROM air_curtain_dimensions
    WHERE model_id IS NOT NULL
  ) t WHERE rn > 1
);

UPDATE air_curtain_dimensions
SET values = jsonb_build_object('L', '900')
WHERE model_id = 'df9d3637-9b53-4fae-a80b-0f30408f983b';

CREATE UNIQUE INDEX IF NOT EXISTS air_curtain_dimensions_series_model_unique
  ON air_curtain_dimensions (series_id, model_id)
  WHERE model_id IS NOT NULL;
