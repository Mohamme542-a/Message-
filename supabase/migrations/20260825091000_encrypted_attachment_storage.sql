INSERT INTO storage.buckets (id, name, public)
VALUES ('encrypted-attachments', 'encrypted-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "conversation members upload encrypted attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'encrypted-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND auth.uid() IN (c.user_a, c.user_b)
  )
);

CREATE POLICY "conversation members read encrypted attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'encrypted-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND auth.uid() IN (c.user_a, c.user_b)
  )
);
