import * as React from "react";

import { apiFetch } from "@/api/client";
import { getToken } from "@/stores/auth-store";

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: number;
}

export interface UseAttachmentsResult {
  attachments: Attachment[];
  isLoading: boolean;
  error: string | null;
  uploadProgress: number | null;
  upload(file: File): Promise<Attachment>;
  deleteAttachment(id: string): void;
  refetch(): Promise<void>;
}

export function useAttachments(taskId: string | null): UseAttachmentsResult {
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);

  const refetch = React.useCallback(async () => {
    if (!taskId) {
      setAttachments([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ attachments: Attachment[] }>(`/api/tasks/${taskId}/attachments`);
      setAttachments(data.attachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attachments");
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  // fetch() cannot report upload progress, so uploads go through XHR directly
  // rather than apiFetch — the one call site that needs this, kept local here.
  const upload = React.useCallback(
    (file: File) => {
      if (!taskId) return Promise.reject(new Error("No task selected"));
      return new Promise<Attachment>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/tasks/${taskId}/attachments`);
        const token = getToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          setUploadProgress(null);
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText) as { attachment: Attachment };
            setAttachments((prev) => [...prev, data.attachment]);
            resolve(data.attachment);
          } else {
            const body = JSON.parse(xhr.responseText || "{}") as { error?: { message?: string } };
            reject(new Error(body.error?.message ?? "Upload failed"));
          }
        };
        xhr.onerror = () => {
          setUploadProgress(null);
          reject(new Error("Upload failed"));
        };
        xhr.send(form);
      });
    },
    [taskId],
  );

  function deleteAttachment(id: string) {
    const previous = attachments.find((a) => a.id === id);
    if (!previous) return;

    setAttachments((prev) => prev.filter((a) => a.id !== id));
    apiFetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => {
      setAttachments((prev) => [...prev, previous]);
    });
  }

  return { attachments, isLoading, error, uploadProgress, upload, deleteAttachment, refetch };
}

// Bypasses apiFetch since the response is a blob, not JSON — single call site.
export async function downloadAttachment(id: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/attachments/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
