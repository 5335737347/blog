"use client";

import dynamic from "next/dynamic";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
});

interface ArticleEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ArticleEditor({ value, onChange }: ArticleEditorProps) {
  return (
    <div data-color-mode="light" className="dark:[&_.w-md-editor]:bg-gray-800">
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || "")}
        height={500}
        preview="live"
      />
    </div>
  );
}
