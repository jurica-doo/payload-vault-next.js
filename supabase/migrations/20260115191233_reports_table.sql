CREATE TYPE document_category AS ENUM (
  'Strom & Gas', 
  'Barmenia Abrechnung', 
  'IKK Abrechnung', 
  'Adcuri Abschlussprovision', 
  'Adcuri Bestandsprovision'
);

CREATE TABLE public.pdf_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category document_category NOT NULL,
  profit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  date_created DATE NOT NULL,
  date_uploaded TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  file_name TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.pdf_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own records" 
ON public.pdf_records FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own records" 
ON public.pdf_records FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own records" 
ON public.pdf_records FOR DELETE 
USING (auth.uid() = user_id);