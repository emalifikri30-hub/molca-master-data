import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addMeter,
  addReading,
  deleteMeter,
  updateMeter,
  getAccess,
  getAssetDetail,
  getAssetTree,
  getFailureCodes,
  getMe,
  saveProfile,
} from "@/lib/api";

import type { ProfileInput } from "@/lib/types";

const meKey = ["me"] as const;
// Scope root for every MAM data query, so a session expiry drops them all in one call.
const mamKey = ["mam"] as const;
const accessKey = [...mamKey, "access"] as const;
const assetTreeKey = [...mamKey, "assets", "tree"] as const;
const assetKey = (id: string) => [...mamKey, "assets", "detail", id] as const;
const failureCodesKey = (cls?: string) => [...mamKey, "failure-codes", cls ?? "*"] as const;

const meQueryOptions = queryOptions({
  queryKey: meKey,
  queryFn: getMe,
  staleTime: 5 * 60 * 1000,
  retry: false,
});
const accessQueryOptions = queryOptions({
  queryKey: accessKey,
  queryFn: getAccess,
  staleTime: 60 * 1000,
});
const assetTreeQueryOptions = queryOptions({
  queryKey: assetTreeKey,
  queryFn: getAssetTree,
  staleTime: 60 * 1000,
});
const assetQueryOptions = (id: string) =>
  queryOptions({ queryKey: assetKey(id), queryFn: () => getAssetDetail(id) });

const useMe = () => useQuery(meQueryOptions);
const useAccess = () => useQuery(accessQueryOptions);
const useAssetTree = () => useQuery(assetTreeQueryOptions);
const useAsset = (id: string) => useQuery({ ...assetQueryOptions(id), enabled: !!id });
const useFailureCodes = (cls?: string) =>
  useQuery({
    queryKey: failureCodesKey(cls),
    queryFn: () => getFailureCodes(cls),
    staleTime: 10 * 60 * 1000,
  });

/** True when the person holds maintenance:<feature>:tenant:<action>. */
function useCan(feature: string, action: string): boolean {
  const { data } = useAccess();
  return !!data?.permissions.some(
    (p) => p === "*" || p === `maintenance:${feature}:tenant:${action}`,
  );
}

/** True when the tenant's licence holds the module (MNT.CORE, MNT.CMMS …). */
function useLicensed(module: string): boolean | undefined {
  const { data } = useAccess();
  return data ? !!data.licence?.modules.includes(module) : undefined;
}

function useSaveProfile(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => saveProfile(assetId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: assetKey(assetId) }),
  });
}

function useAddMeter(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: string; unit: string }) => addMeter(assetId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: assetKey(assetId) }),
  });
}

function useAddReading(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      meterId,
      value,
      note,
      correctsId,
    }: {
      meterId: string;
      value: number;
      note?: string;
      correctsId?: string;
    }) => addReading(meterId, { value, note, correctsId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: assetKey(assetId) }),
  });
}

function useUpdateMeter(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meterId, ...input }: { meterId: string; unit?: string; source?: string }) =>
      updateMeter(meterId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: assetKey(assetId) }),
  });
}

function useDeleteMeter(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meterId: string) => deleteMeter(meterId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: assetKey(assetId) }),
  });
}

export {
  accessQueryOptions,
  assetQueryOptions,
  assetTreeQueryOptions,
  mamKey,
  meKey,
  meQueryOptions,
  useAccess,
  useAddMeter,
  useDeleteMeter,
  useUpdateMeter,
  useAddReading,
  useAsset,
  useAssetTree,
  useCan,
  useFailureCodes,
  useLicensed,
  useMe,
  useSaveProfile,
};
