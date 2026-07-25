"use client";

import { Send } from "lucide-react";
import { useState } from "react";

const samples = [
  "今天学习 AWS 40 分钟",
  "明天下午练肩",
  "我今年想考 AWS DevOps",
  "周三晚上提醒我练肩",
  "下周 Sansan"
];

export default function MockPage() {
  const [text, setText] = useState(samples[0]);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "demo-user", source: "mock", text })
    });
    setResult(await response.json());
    setLoading(false);
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-lg border border-black/10 bg-white/75 p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-moss">Input Adapter</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Local Mock Chat</h1>
        <p className="mt-2 text-sm text-black/60">测试阶段用这个窗口模拟微信、自有 App 或 Telegram。Dashboard 不承担输入。</p>
        <div className="mt-5 space-y-2">
          {samples.map((sample) => (
            <button key={sample} className="block w-full rounded-md border border-black/10 bg-soil px-3 py-2 text-left text-sm hover:border-moss/50" onClick={() => setText(sample)}>
              {sample}
            </button>
          ))}
        </div>
        <textarea className="mt-5 min-h-32 w-full rounded-lg border border-black/15 bg-white p-3 outline-none focus:border-moss" value={text} onChange={(event) => setText(event.target.value)} />
        <button className="mt-3 inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f684b]" onClick={submit} disabled={loading}>
          <Send size={16} />
          {loading ? "Parsing..." : "Send to Intake"}
        </button>
      </section>
      <section className="rounded-lg border border-black/10 bg-[#17201d] p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">AI JSON + Write Result</h2>
          <a className="text-sm text-white/70 underline" href="/dashboard?userId=demo-user">Open Dashboard</a>
        </div>
        <pre className="mt-4 max-h-[72vh] overflow-auto rounded-lg bg-black/30 p-4 text-xs leading-relaxed">
          {result ? JSON.stringify(result, null, 2) : "Send a message to see structured output."}
        </pre>
      </section>
    </main>
  );
}
