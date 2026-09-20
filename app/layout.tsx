import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FITROOM — 판매자와 이용자를 위한 패션 워크스페이스",
  description: "판매자는 AI 광고 문구를 만들고, 이용자는 내 체형에 가까운 3D 옷장에서 코디와 실측을 확인하세요.",
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
