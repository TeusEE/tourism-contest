import type { Metadata } from "next";

import { ResultsState } from "@/components/results-state";

export const metadata: Metadata = {
  title: "분석 결과",
  description: "여행계획 분석 결과",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResultsPage() {
  return <ResultsState />;
}
