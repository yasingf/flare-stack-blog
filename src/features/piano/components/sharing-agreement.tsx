import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpcClient } from "@/lib/orpc";
import {
  PIANO_SHARING_TERMS_URL,
  PIANO_SHARING_TERMS_VERSION,
} from "../sharing-terms";

export function useSharingAgreement(userId?: string) {
  const client = useQueryClient();
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(false), [userId]);
  const queryKey = ["piano-sharing-agreement", userId];
  const query = useQuery({
    queryKey,
    queryFn: () => orpcClient.piano.shared.agreement(),
    enabled: !!userId,
  });
  async function ensureAccepted() {
    if (query.data?.accepted) return;
    if (!userId || !query.data || !checked)
      throw new Error("请先阅读并同意曲谱共享协议。");
    await orpcClient.piano.shared.acceptAgreement({
      accepted: true,
      version: PIANO_SHARING_TERMS_VERSION,
    });
    client.setQueryData(queryKey, {
      accepted: true,
      version: PIANO_SHARING_TERMS_VERSION,
      acceptedAt: Date.now(),
    });
  }
  return {
    query,
    checked,
    setChecked,
    ensureAccepted,
    accepted: query.data?.accepted ?? false,
    ready: !!userId && !!query.data && (query.data.accepted || checked),
  };
}
export function SharingAgreement({
  agreement,
}: {
  agreement: ReturnType<typeof useSharingAgreement>;
}) {
  const link = (
    <a href={PIANO_SHARING_TERMS_URL} target="_blank" rel="noreferrer">
      《曲谱共享协议》
    </a>
  );
  if (agreement.query.isPending)
    return (
      <p className="piano-caption" role="status">
        正在读取共享授权…
      </p>
    );
  if (agreement.query.isError)
    return (
      <p className="piano-error" role="alert">
        授权状态读取失败。
        <button type="button" onClick={() => void agreement.query.refetch()}>
          重试
        </button>
      </p>
    );
  return agreement.accepted ? (
    <p className="piano-caption piano-agreement">
      已同意{link}，本账号后续上传无需重复确认。
    </p>
  ) : (
    <label className="piano-agreement piano-agreement-check">
      <input
        type="checkbox"
        checked={agreement.checked}
        onChange={(e) => agreement.setChecked(e.target.checked)}
      />
      <span>
        我已阅读并同意{link}
        ，确认有权分享曲谱，并知悉上传后全站公开。每个账号只需确认一次。
      </span>
    </label>
  );
}
