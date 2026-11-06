import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";

import { http } from "@/lib/http";
import { mdKey } from "@/lib/md";

import type { WebResponse } from "@/lib/types";

// QR labels of the assets (sub-feature of the asset register, API /asset-labels). The QR holds a link to the asset
// in the Maintenance app (`<MAM>/q/<assetId>`), so a phone camera opens the asset there; the in-app scanners read
// the id back from the same link.

const API = "/api/proxy/api/v1";
const MAINTENANCE_WEB =
  (import.meta.env.VITE_MAINTENANCE_WEB_URL as string | undefined) ||
  (import.meta.env.DEV ? "http://localhost:3600" : window.location.origin);

type LabelStatus = "printed" | "installed" | "damaged" | "retired";
type AssetLabel = {
  id: string;
  assetId: string;
  status: LabelStatus;
  printCount: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string;
  installedAt: string | null;
  installedBy: string;
  note: string;
};

const labelsKey = [...mdKey, "asset-labels"] as const;

/** What the QR of an asset holds. */
const qrLink = (assetId: string) => `${MAINTENANCE_WEB.replace(/\/$/, "")}/q/${assetId}`;
/** The QR as an SVG data URL (crisp at any print size). */
const qrSvg = (assetId: string) =>
  QRCode.toString(qrLink(assetId), { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(
    (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );

const useAssetLabels = () =>
  useQuery({
    queryKey: labelsKey,
    queryFn: async () => {
      const { data } = await http.get<WebResponse<AssetLabel[]>>(`${API}/asset-labels`);
      if (!data.data) throw new Error(data.error ?? "labels unavailable");
      return data.data;
    },
  });

function useLabelMutation<I, O>(fn: (i: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: labelsKey }),
  });
}

/** Records a print run (one more print per asset). */
const usePrintLabels = () =>
  useLabelMutation(async (assetIds: string[]) => {
    const { data } = await http.post<WebResponse<AssetLabel[]>>(
      `${API}/asset-labels/print`,
      { assetIds },
      { headers: { "x-audit-reason": encodeURIComponent("Cetak label QR") } },
    );
    if (!data.data) throw new Error(data.error ?? "print failed");
    return data.data;
  });

const useLabelStatus = () =>
  useLabelMutation(
    async (b: { assetId: string; status: "installed" | "damaged" | "retired"; note?: string }) => {
      const { data } = await http.post<WebResponse<AssetLabel>>(
        `${API}/asset-labels/${b.assetId}/status`,
        { status: b.status, note: b.note },
        { headers: { "x-audit-reason": encodeURIComponent(b.note || `Label ${b.status}`) } },
      );
      if (!data.data) throw new Error(data.error ?? "update failed");
      return data.data;
    },
  );

export { qrLink, qrSvg, useAssetLabels, useLabelStatus, usePrintLabels };
export type { AssetLabel, LabelStatus };
