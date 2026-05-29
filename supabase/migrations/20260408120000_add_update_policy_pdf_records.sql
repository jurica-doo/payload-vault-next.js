CREATE POLICY "Users can update own records"
ON public.pdf_records FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
