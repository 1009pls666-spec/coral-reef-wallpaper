import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./reef.css";

export const metadata: Metadata = {
  title: "산호초 바다 — 나만의 수중 풍경",
  description: "실사 산호초 속 물고기와 천천히 헤엄치고 나만의 수중 풍경을 꾸미는 인터랙티브 바다",
  applicationName: "나의 산호초 바다",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "산호초 바다",
  },
  icons: {
    icon: "/reef-icon-192.png",
    apple: "/reef-icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#006d96",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
