import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { AnalysisProvider } from "@/lib/analysis/context";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Travel Congestion",
    template: "%s | Travel Congestion",
  },
  description:
    "여행일과 목적지 주변 행사 밀집 가능성을 확인하는 여행 참고 서비스",
  icons: {
    icon: "/icon.svg",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <AnalysisProvider>
          <SiteHeader />
          <main className="site-main">{children}</main>
          <footer className="site-footer">
            <div className="site-footer__inner">
              <span>Travel Congestion MVP</span>
              <span>여행 정보는 참고용이며 영구 저장하지 않습니다.</span>
            </div>
          </footer>
        </AnalysisProvider>
      </body>
    </html>
  );
}
