import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FITROOM — 의류 판매자를 위한 AI 광고 스튜디오",
  description: "상품 정보를 입력하면 서로 다른 관점의 의류 광고 문구 초안 3개를 만들어보세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
