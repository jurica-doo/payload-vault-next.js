-- Migration to restrict file format to pdf and size to to 500 KB in the 'pdf_reports' bucket
UPDATE storage.buckets 
SET file_size_limit = 512000,
    allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'pdf_reports';