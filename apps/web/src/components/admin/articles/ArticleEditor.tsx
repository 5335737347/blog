"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { ICommand } from "@uiw/react-md-editor";
import { getCommands } from "@uiw/react-md-editor/commands";
import Alert from "@/components/admin/ui/Alert";
import ImagePickerModal from "@/components/admin/resources/ImagePickerModal";
import { readApiData, readApiError } from "@/lib/api-client";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
});

interface ArticleEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 文章正文编辑器。在默认工具栏前加两个图片命令：
 * 上传（存入资源库「文章图片」）与从图库选择，插入位置取命令触发时的光标，
 * 异步上传完成后回到同一位置插入，长文里不会跳到文末。
 */
export default function ArticleEditor({ value, onChange }: ArticleEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  /** 待插入回调：命令触发时捕获光标 api，等图片就绪后回插。 */
  const insertRef = useRef<((markdown: string) => void) | null>(null);

  function captureInsert(api: {
    textArea: HTMLTextAreaElement;
    replaceSelection: (text: string) => unknown;
  }) {
    const at = api.textArea.selectionStart;
    insertRef.current = (markdown: string) => {
      api.textArea.focus();
      api.textArea.selectionStart = at;
      api.textArea.selectionEnd = at;
      api.replaceSelection(markdown);
      insertRef.current = null;
    };
  }

  const imageCommands: ICommand[] = [
    {
      name: "upload-image",
      keyCommand: "upload-image",
      buttonProps: { "aria-label": "上传图片", title: "上传图片到资源库并插入正文" },
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      execute: (_state, api) => {
        captureInsert(api);
        fileRef.current?.click();
      },
    },
    {
      name: "pick-image",
      keyCommand: "pick-image",
      buttonProps: { "aria-label": "从图库选择图片", title: "从资源库选择图片插入正文" },
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
          <circle cx="9" cy="10" r="1.6" fill="currentColor" />
          <path
            d="m5 18 4.5-4.5a1.5 1.5 0 0 1 2.1 0L16 18m-2.5-2.5 1.4-1.4a1.5 1.5 0 0 1 2.2 0L20 17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ),
      execute: (_state, api) => {
        captureInsert(api);
        setPickerOpen(true);
      },
    },
    ...getCommands(),
  ];

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !insertRef.current) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "article");
      const res = await fetch("/api/images", { method: "POST", body: fd });
      if (!res.ok) {
        setError(await readApiError(res, "上传失败"));
        return;
      }
      const image = await readApiData<{ url: string }>(res);
      insertRef.current?.(`![${file.name.replace(/\.[^.]+$/, "")}](${image.url})`);
    } catch {
      setError("网络错误，上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div data-color-mode="light" className="dark:[&_.w-md-editor]:bg-gray-800">
      {error && <Alert variant="error">{error}</Alert>}
      {uploading && <Alert variant="info">图片上传中…</Alert>}
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,.avif"
        className="hidden"
        onChange={handleFileChosen}
      />
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || "")}
        commands={imageCommands}
        height={500}
        preview="live"
      />
      <ImagePickerModal
        kind="article"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(url) => {
          setPickerOpen(false);
          insertRef.current?.(`![](${url})`);
        }}
      />
    </div>
  );
}
