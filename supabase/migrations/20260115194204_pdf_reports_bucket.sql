-- Create a new storage bucket for PDF reports
INSERT INTO storage.buckets (id, name, public) 
VALUES ('pdf_reports', 'pdf_reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pdf_reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view their own PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'pdf_reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pdf_reports' AND (storage.foldername(name))[1] = auth.uid()::text);