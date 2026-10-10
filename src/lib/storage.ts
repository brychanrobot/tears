export async function uploadImageToConvex(
  file: File | Blob,
  generateUploadUrl: () => Promise<string>,
): Promise<string> {
  const postUrl = await generateUploadUrl();
  const response = await fetch(postUrl, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status: ${response.status}`);
  }

  const data = (await response.json()) as { storageId: string };
  return data.storageId;
}
