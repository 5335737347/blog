"use client";

import { useState } from "react";
import Alert from "@/components/admin/ui/Alert";
import Button from "@/components/ui/Button";
import { readApiData, readApiError } from "@/lib/api-client";

/**
 * 一键收编：扫描全部文章的封面与正文图片 URL 登记进图库。
 * 后端幂等（已登记的跳过），重复点击只会看到 0。
 */
export default function AdoptImagesButton() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  const handleAdopt = async () => {
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/images/adopt", { method: "POST" });
      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "收编失败"));
        return;
      }
      const result = await readApiData<{ covers: number; articles: number }>(res);
      setMessageKind("success");
      setMessage(
        result.covers === 0 && result.articles === 0
          ? "扫描完成：没有需要新收编的图片"
          : `收编完成：新增封面 ${result.covers} 张、文章图片 ${result.articles} 张（刷新页面可见）`
      );
      if (result.covers > 0 || result.articles > 0) {
        // 收编改变了下方列表内容，整页刷新是最可靠的方式。
        window.setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      setMessageKind("error");
      setMessage("网络错误，收编失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="secondary" size="sm" disabled={running} onClick={handleAdopt}>
        {running ? "扫描中…" : "扫描收编文章图片"}
      </Button>
      {message && <Alert variant={messageKind} className="mb-0 whitespace-pre-line">{message}</Alert>}
    </div>
  );
}
