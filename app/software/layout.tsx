import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "石听 NeoLoop｜只读运营工作台",
  description: "使用合成公开快照体验反馈接入、个案闭环、SLA 协同、问题聚类和改进观察。",
};

export default function SoftwareLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
