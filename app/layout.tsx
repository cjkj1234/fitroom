import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FITROOM — 내 체형으로 입는 옷장",
  description: "내 체형의 3D 아바타에 옷을 입혀보고, 실측으로 예상 핏을 비교해보세요.",
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
