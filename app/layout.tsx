import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title: "石听 NeoLoop｜无人配送客户之声闭环中枢",
    description: "石听 NeoLoop 公开交互原型。全部业务数据均为合成样例。",
    openGraph: {
      title: "石听 NeoLoop｜无人配送客户之声闭环中枢",
      description: "让每条反馈都找到一辆车、一个任务、一个责任人和一次改进。",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "石听 NeoLoop 公开交互原型" }],
      locale: "zh_CN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "石听 NeoLoop｜无人配送客户之声闭环中枢",
      description: "让每条反馈都找到一辆车、一个任务、一个责任人和一次改进。",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
