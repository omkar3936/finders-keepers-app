UPDATE storage.buckets
SET public = false
WHERE id = 'item-images';

DROP POLICY IF EXISTS "Report images are publicly visible" ON storage.objects;

CREATE POLICY "Users and admins can view protected report images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'item-images'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
  )
);