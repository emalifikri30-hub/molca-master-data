import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/http";
import { mdKey } from "@/lib/md";

import type { WebResponse } from "@/lib/types";

// Change control on the web (API /change-requests): sensitive Master Data changes wait for a second person.

const API = "/api/proxy/api/v1";

type ChangeRequest = {
  id: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  action: "decommission" | "deactivate" | "revalue" | string;
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "failed";
  makerId: string;
  makerName: string;
  decidedByName: string;
  decisionNote: string;
  decidedAt: string | null;
  createdAt?: string;
};

const key = [...mdKey, "change-requests"] as const;

const useChangeRequests = () =>
  useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await http.get<WebResponse<ChangeRequest[]>>(`${API}/change-requests`);
      if (!data.data) throw new Error(data.error ?? "change requests unavailable");
      return data.data;
    },
    refetchInterval: 60_000,
  });

function useChangeMutation<I>(fn: (i: I) => Promise<unknown>) {
  const qc = useQueryClient();
  // an approved change touches the record it is about: refresh every Master Data read
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: mdKey }),
  });
}

const useDecideChange = () =>
  useChangeMutation(async (b: { id: string; decision: "approve" | "reject"; note?: string }) => {
    const { data } = await http.post<WebResponse<ChangeRequest>>(
      `${API}/change-requests/${b.id}/decision`,
      { decision: b.decision, note: b.note },
      { headers: { "x-audit-reason": encodeURIComponent(b.note || `Keputusan ${b.decision}`) } },
    );
    if (!data.data) throw new Error(data.error ?? "decision failed");
    return data.data;
  });
const useWithdrawChange = () =>
  useChangeMutation(async (id: string) => {
    const { data } = await http.post<WebResponse<ChangeRequest>>(
      `${API}/change-requests/${id}/withdraw`,
      {},
      { headers: { "x-audit-reason": encodeURIComponent("Ditarik pembuat") } },
    );
    if (!data.data) throw new Error(data.error ?? "withdraw failed");
    return data.data;
  });

export { useChangeRequests, useDecideChange, useWithdrawChange };
export type { ChangeRequest };
