import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FITROOM — 의류 소상공인과 고객을 잇는 3D 옷장",
  description: "소상공인은 상품과 실측을 등록해 알리고, 이용자는 내 체형에 가까운 3D 옷장에서 입어본 뒤 상점을 발견합니다.",
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
