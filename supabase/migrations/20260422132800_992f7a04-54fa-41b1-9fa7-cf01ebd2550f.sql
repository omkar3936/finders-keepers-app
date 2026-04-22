DROP POLICY IF EXISTS "Users and admins can view protected report images" ON storage.objects;

CREATE POLICY "Users can view permitted report images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'item-images'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.item_reports r
      WHERE r.image_url = storage.objects.name
        AND r.status IN ('verified', 'matched', 'resolved')
    )
  )
);