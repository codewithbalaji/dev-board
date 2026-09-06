import * as React from "react";

import { apiFetch } from "@/api/client";

export interface Member {
  userId: string;
  name: string;
  avatarColor: string;
  role: "owner" | "admin" | "member" | "viewer";
}

export function useMembers(projectId: string | null): Member[] {
  const [members, setMembers] = React.useState<Member[]>([]);

  React.useEffect(() => {
    if (!projectId) {
      setMembers([]);
      return;
    }
    apiFetch<{ members: Member[] }>(`/api/projects/${projectId}/members`)
      .then((data) => setMembers(data.members))
      .catch(() => setMembers([]));
  }, [projectId]);

  return members;
}
