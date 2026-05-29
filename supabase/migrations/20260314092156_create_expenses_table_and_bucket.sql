-- 1) Expense category enum (German labels used by frontend options)
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_category') THEN
		CREATE TYPE public.expense_category AS ENUM (
			'Mobilität',
			'Geschäftsessen',
			'Büro & Arbeitsmittel',
			'Kommunikation',
			'Weiterbildung',
			'Reisen',
			'Versicherungen',
			'Bank & Gebühren',
			'Marketing',
			'Sonstiges'
		);
	END IF;
END $$;

-- 2) Expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
	id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	category public.expense_category NOT NULL,
	expense_date DATE NOT NULL,
	amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
	vendor_name TEXT,
	file_name TEXT NOT NULL,
	image_url TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT unique_expense_file_name_per_user UNIQUE (user_id, file_name)
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses"
ON public.expenses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses"
ON public.expenses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses"
ON public.expenses FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses"
ON public.expenses FOR DELETE
USING (auth.uid() = user_id);

-- 4) Bucket for invoice images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
	'expense_invoices',
	'expense_invoices',
	false,
	5242880,
	ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
	public = EXCLUDED.public,
	file_size_limit = EXCLUDED.file_size_limit,
	allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies scoped to user folder path: <user_id>/<file_name>
CREATE POLICY "Users can upload own expense invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
	bucket_id = 'expense_invoices'
	AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own expense invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (
	bucket_id = 'expense_invoices'
	AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own expense invoices"
ON storage.objects FOR UPDATE
TO authenticated
USING (
	bucket_id = 'expense_invoices'
	AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
	bucket_id = 'expense_invoices'
	AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own expense invoices"
ON storage.objects FOR DELETE
TO authenticated
USING (
	bucket_id = 'expense_invoices'
	AND (storage.foldername(name))[1] = auth.uid()::text
);
