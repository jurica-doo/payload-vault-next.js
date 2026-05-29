-- Add products JSONB column to store array of {product_name, amount, category}
ALTER TABLE public.expenses
  ADD COLUMN products JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Drop the old unique constraint on file_name (no more __p suffixes)
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS unique_expense_file_name_per_user;

-- Re-add unique constraint (one row per receipt per user)
ALTER TABLE public.expenses
  ADD CONSTRAINT unique_expense_file_name_per_user UNIQUE (user_id, file_name);
