-- Ensure engine_tbo_reference supports deterministic upserts by manufacturer + model.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_tbo_reference'
      AND column_name = 'engine_model'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_engine_tbo_reference_mfr_model
      ON public.engine_tbo_reference (manufacturer, engine_model);
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_tbo_reference'
      AND column_name = 'engine_model_pattern'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_engine_tbo_reference_mfr_model_pattern
      ON public.engine_tbo_reference (manufacturer, engine_model_pattern);
  END IF;
END $$;
