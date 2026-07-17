import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "石听 NeoLoop｜无人配送客户之声闭环中枢",
  description: "石听 NeoLoop 公开演示版。全部业务数据均为合成样例。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
