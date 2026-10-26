import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";

export function PasskeySettings() {
  const {
    data: keys,
    refetch,
    isPending,
    error,
  } = authClient.useListPasskeys();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function add() {
    setBusy(true);
    setNotice("");
    try {
      if (!window.PublicKeyCredential)
        throw new Error(
          "当前浏览器不支持通行密钥，请使用新版 Chrome、Edge 或 Safari。",
        );
      const result = await authClient.passkey.addPasskey({
        name: name.trim() || "我的通行密钥",
      });
      if (result.error)
        throw new Error(
          result.error.message ||
            "绑定未完成。请重新登录后再试，并完成设备确认。",
        );
      setName("");
      setNotice("已绑定，下次可直接使用通行密钥登录。");
      await refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "绑定失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="border-t border-border/30 mt-10 pt-8 space-y-4"
      aria-label="通行密钥管理"
    >
      <h2 className="font-serif text-xl flex items-center gap-2">
        <Fingerprint size={20} />
        通行密钥
      </h2>
      <p className="text-sm text-muted-foreground">
        使用设备指纹、面容、系统 PIN
        或安全密钥登录，无需等待验证码。首次绑定需要近期登录；请保留原有登录方式，以便更换设备时恢复账号。
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          设备名称
          <input
            className="block border border-border/50 bg-transparent rounded px-3 py-2 mt-2"
            placeholder="例如：我的 MacBook"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button onClick={() => void add()} disabled={busy} loading={busy}>
          添加通行密钥
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm">
          密钥列表读取失败。
          <button className="underline" onClick={() => void refetch()}>
            重试
          </button>
        </p>
      ) : isPending ? (
        <p role="status">正在读取密钥…</p>
      ) : keys?.length ? (
        <ul className="space-y-2">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-3 border-b border-border/20 py-3 text-sm"
            >
              <span>{key.name || "通行密钥"}</span>
              <Button
                variant="text"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      `删除「${key.name || "通行密钥"}」？这把密钥将无法再登录。`,
                    )
                  )
                    return;
                  setBusy(true);
                  setNotice("");
                  void authClient.passkey
                    .deletePasskey({ id: key.id })
                    .then(async (result) => {
                      if (result.error) throw new Error(result.error.message);
                      await refetch();
                      setNotice("通行密钥已移除。");
                    })
                    .catch((e: unknown) =>
                      setNotice(e instanceof Error ? e.message : "删除失败。"),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                移除
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">还没有绑定通行密钥。</p>
      )}
    </section>
  );
}
