ALTER TABLE public.lpo_orders
  ADD COLUMN IF NOT EXISTS committed_delivery_date_min date,
  ADD COLUMN IF NOT EXISTS order_ack_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS pi_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS advance_payment_status text NOT NULL DEFAULT 'not_sent';