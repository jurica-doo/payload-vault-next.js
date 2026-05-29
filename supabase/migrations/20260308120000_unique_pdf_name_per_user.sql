-- Add unique constraint on (user_id, file_name) to prevent duplicate PDF names per user
ALTER TABLE public.pdf_records
ADD CONSTRAINT unique_file_name_per_user UNIQUE (user_id, file_name);
